import WebSocket from "isomorphic-ws";

export type RealtimeHandler<T = unknown> = (payload: T) => void;

interface MessageEventLike {
    data?: unknown;
}

interface QueuedMessage {
    event: string;
    data: unknown;
}

export interface RealtimeChannel {
    on<T = unknown>(event: string, handler: RealtimeHandler<T>): () => void;
    emit(event: string, payload: unknown): void;
    updateAuth(apiKey: string | null): void;
    close(): void;
}

type StoredHandler = RealtimeHandler<unknown>;

const RECONNECT_DELAY_MS = 1000;
const protocolRegex = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//u;
const decoder = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;

function normalizeNamespace(namespace: string): string {
  return namespace.startsWith("/") ? namespace : `/${ namespace }`;
}

function joinUrl(
  baseUrl: string,
  namespace: string,
  apiKey: string | null
): string {
  const normalizedNamespace = normalizeNamespace(namespace);

  if (!baseUrl) {
    if (!apiKey) {
      return normalizedNamespace;
    }
    return `${ normalizedNamespace }?apiKey=${ encodeURIComponent(apiKey) }`;
  }

  try {
    if (protocolRegex.test(baseUrl)) {
      const url = new URL(baseUrl);
      const basePath = url.pathname.replace(/\/$/u, "");
      url.pathname = `${ basePath }${ normalizedNamespace }`;

      if (url.protocol === "http:") {
        url.protocol = "ws:";
      } else if (url.protocol === "https:") {
        url.protocol = "wss:";
      }

      if (apiKey) {
        url.searchParams.set("apiKey", apiKey);
      } else {
        url.searchParams.delete("apiKey");
      }

      return url.toString();
    }

    const url = new URL(baseUrl, "http://placeholder");
    const basePath = url.pathname.replace(/\/$/u, "");

    if (apiKey) {
      url.searchParams.set("apiKey", apiKey);
    } else {
      url.searchParams.delete("apiKey");
    }

    const query = url.searchParams.toString();
    const path = `${ basePath }${ normalizedNamespace }` || normalizedNamespace;
    return `${ path }${ query ? `?${ query }` : "" }`;
  } catch {
    const sanitizedBase = baseUrl.replace(/\/$/u, "");
    const path = `${ sanitizedBase }${ normalizedNamespace }` || normalizedNamespace;
    if (!apiKey) {
      return path;
    }
    const separator = path.includes("?") ? "&" : "?";
    return `${ path }${ separator }apiKey=${ encodeURIComponent(apiKey) }`;
  }
}

function toUtf8(data: unknown): string | null {
  if (typeof data === "string") {
    return data;
  }

  if (typeof ArrayBuffer !== "undefined") {
    if (data instanceof ArrayBuffer) {
      return decoder ? decoder.decode(data) : null;
    }

    if (ArrayBuffer.isView(data)) {
      const view = data as ArrayBufferView;
      const slice = view.buffer.slice(
        view.byteOffset,
        view.byteOffset + view.byteLength
      );
      return decoder ? decoder.decode(slice) : null;
    }
  }

  return null;
}

export function createRealtimeChannel(
  baseUrl: string,
  namespace: string,
  initialApiKey: string | null
): RealtimeChannel {
  const listeners = new Map<string, Set<StoredHandler>>();
  const queue: QueuedMessage[] = [];
  let currentApiKey = initialApiKey ?? null;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closedByUser = false;

  const flushQueue = (): void => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) {
        break;
      }
      socket.send(JSON.stringify(next));
    }
  };

  const notify = (event: string, payload: unknown): void => {
    // notify handlers of the parsed event
    const handlers = listeners.get(event);
    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      handler(payload);
    }
  };

  const handleMessage = (raw: unknown): void => {
    // process raw message bytes into JSON
    const content = toUtf8(raw);
    if (!content) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return;
    }

    if (!parsed || typeof parsed !== "object") {
      return;
    }

    const event = (parsed as { event?: unknown; }).event;
    if (typeof event !== "string") {
      return;
    }

    const data = (parsed as { data?: unknown; }).data;
    // parsed event ready for handlers
    notify(event, data);
  };

  const clearReconnect = (): void => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const destroySocket = (): void => {
    if (!socket) {
      return;
    }

    const instance = socket;
    socket = null;
    instance.onopen = null;
    instance.onmessage = null;
    instance.onclose = null;
    instance.onerror = null;

    if (
      instance.readyState === WebSocket.OPEN ||
            instance.readyState === WebSocket.CONNECTING
    ) {
      instance.close();
    }
  };

  const scheduleReconnect = (): void => {
    if (closedByUser || reconnectTimer) {
      return;
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_DELAY_MS);
  };

  const connect = (): void => {
    clearReconnect();
    const url = joinUrl(baseUrl, namespace, currentApiKey);
    const instance = new WebSocket(url);
    socket = instance;
    closedByUser = false;

    instance.onopen = () => {
      flushQueue();
    };

    instance.onmessage = (event: MessageEventLike) => {
      handleMessage(event.data);
    };

    instance.onerror = () => {
      /* swallow errors; reconnection logic handles retries */
    };

    instance.onclose = () => {
      instance.onopen = null;
      instance.onmessage = null;
      instance.onclose = null;
      instance.onerror = null;
      socket = null;
      if (!closedByUser) {
        scheduleReconnect();
      }
    };
  };

  const on: RealtimeChannel[ "on" ] = (event, handler) => {
    const handlers = listeners.get(event) ?? new Set<StoredHandler>();
    handlers.add(handler as StoredHandler);
    listeners.set(event, handlers);

    return () => {
      const current = listeners.get(event);
      if (!current) {
        return;
      }
      current.delete(handler as StoredHandler);
      if (current.size === 0) {
        listeners.delete(event);
      }
    };
  };

  const emit = (event: string, payload: unknown): void => {
    const message: QueuedMessage = { event, data: payload };

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return;
    }

    queue.push(message);
  };

  const updateAuth = (apiKey: string | null): void => {
    if (currentApiKey === apiKey) {
      return;
    }

    currentApiKey = apiKey ?? null;
    clearReconnect();
    destroySocket();
    connect();
  };

  const close = (): void => {
    closedByUser = true;
    clearReconnect();
    queue.length = 0;
    destroySocket();
  };

  connect();

  return {
    on,
    emit,
    updateAuth,
    close,
  };
}

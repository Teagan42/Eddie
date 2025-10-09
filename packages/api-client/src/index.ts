import { io, type Socket } from "socket.io-client";
import { OpenAPI } from "./generated/core/OpenAPI";
import { ChatSessionsService } from "./generated/services/ChatSessionsService";
import { TracesService } from "./generated/services/TracesService";
import { LogsService } from "./generated/services/LogsService";
import { ConfigService } from "./generated/services/ConfigService";
import type { ChatSessionDto } from "./generated/models/ChatSessionDto";
import type { ChatMessageDto } from "./generated/models/ChatMessageDto";
import type { CreateChatSessionDto } from "./generated/models/CreateChatSessionDto";
import type { CreateChatMessageDto } from "./generated/models/CreateChatMessageDto";
import type { TraceDto } from "./generated/models/TraceDto";
import type { LogEntryDto } from "./generated/models/LogEntryDto";
import type { RuntimeConfigDto } from "./generated/models/RuntimeConfigDto";
import type { UpdateRuntimeConfigDto } from "./generated/models/UpdateRuntimeConfigDto";

export type {
  ChatSessionDto,
  ChatMessageDto,
  CreateChatSessionDto,
  CreateChatMessageDto,
  TraceDto,
  LogEntryDto,
  RuntimeConfigDto,
  UpdateRuntimeConfigDto,
};

export interface ApiClientOptions {
  baseUrl: string;
  websocketUrl: string;
  apiKey?: string;
}

export type Unsubscribe = () => void;

export interface ChatSessionsSocket {
  onSessionCreated(handler: (session: ChatSessionDto) => void): Unsubscribe;
  onSessionUpdated(handler: (session: ChatSessionDto) => void): Unsubscribe;
  onMessageCreated(handler: (message: ChatMessageDto) => void): Unsubscribe;
  emitMessage(sessionId: string, payload: CreateChatMessageDto): void;
  socket: Socket;
}

export interface TracesSocket {
  onTraceCreated(handler: (trace: TraceDto) => void): Unsubscribe;
  onTraceUpdated(handler: (trace: TraceDto) => void): Unsubscribe;
  socket: Socket;
}

export interface LogsSocket {
  onLogCreated(handler: (entry: LogEntryDto) => void): Unsubscribe;
  socket: Socket;
}

export interface ConfigSocket {
  onConfigUpdated(handler: (config: RuntimeConfigDto) => void): Unsubscribe;
  socket: Socket;
}

export interface ApiClient {
  http: {
    chatSessions: {
      list(): Promise<ChatSessionDto[]>;
      create(input: CreateChatSessionDto): Promise<ChatSessionDto>;
      get(id: string): Promise<ChatSessionDto>;
      archive(id: string): Promise<ChatSessionDto>;
      listMessages(id: string): Promise<ChatMessageDto[]>;
      createMessage(
        id: string,
        input: CreateChatMessageDto
      ): Promise<ChatMessageDto>;
    };
    traces: {
      list(): Promise<TraceDto[]>;
      get(id: string): Promise<TraceDto>;
    };
    logs: {
      list(): Promise<LogEntryDto[]>;
      emit(): Promise<LogEntryDto>;
    };
    config: {
      get(): Promise<RuntimeConfigDto>;
      update(input: UpdateRuntimeConfigDto): Promise<RuntimeConfigDto>;
    };
  };
  sockets: {
    chatSessions: ChatSessionsSocket;
    traces: TracesSocket;
    logs: LogsSocket;
    config: ConfigSocket;
  };
  updateAuth(apiKey?: string): void;
  dispose(): void;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/u, "");
}

function createSocket(
  baseUrl: string,
  namespace: string,
  getHeaders: () => Record<string, string>
): Socket {
  return io(`${baseUrl}${namespace}`, {
    transports: ["websocket"],
    autoConnect: true,
    extraHeaders: getHeaders(),
  });
}

function applySocketAuth(socket: Socket, headers: Record<string, string>): void {
  socket.io.opts.extraHeaders = { ...headers };
  if (socket.connected) {
    socket.disconnect();
    socket.connect();
  }
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const httpBase = normalizeBaseUrl(options.baseUrl);
  const wsBase = normalizeBaseUrl(options.websocketUrl);
  let currentApiKey = options.apiKey ?? null;

  const resolveHeaders = (): Record<string, string> =>
    currentApiKey ? { "x-api-key": currentApiKey } : {};

  const applyHttpAuth = (): void => {
    OpenAPI.BASE = httpBase;
    OpenAPI.WITH_CREDENTIALS = true;
    if (currentApiKey) {
      OpenAPI.TOKEN = currentApiKey;
      OpenAPI.HEADERS = async () => ({ ...resolveHeaders() });
    } else {
      OpenAPI.TOKEN = undefined;
      OpenAPI.HEADERS = undefined;
    }
  };

  applyHttpAuth();

  const chatSocket = createSocket(wsBase, "/chat-sessions", resolveHeaders);
  const tracesSocket = createSocket(wsBase, "/traces", resolveHeaders);
  const logsSocket = createSocket(wsBase, "/logs", resolveHeaders);
  const configSocket = createSocket(wsBase, "/config", resolveHeaders);

  const sockets: Socket[] = [chatSocket, tracesSocket, logsSocket, configSocket];

  const chatSessionsSocket: ChatSessionsSocket = {
    socket: chatSocket,
    onSessionCreated(handler) {
      chatSocket.on("session.created", handler);
      return () => chatSocket.off("session.created", handler);
    },
    onSessionUpdated(handler) {
      chatSocket.on("session.updated", handler);
      return () => chatSocket.off("session.updated", handler);
    },
    onMessageCreated(handler) {
      chatSocket.on("message.created", handler);
      return () => chatSocket.off("message.created", handler);
    },
    emitMessage(sessionId, payload) {
      chatSocket.emit("message.send", { sessionId, message: payload });
    },
  };

  const tracesRealtime: TracesSocket = {
    socket: tracesSocket,
    onTraceCreated(handler) {
      tracesSocket.on("trace.created", handler);
      return () => tracesSocket.off("trace.created", handler);
    },
    onTraceUpdated(handler) {
      tracesSocket.on("trace.updated", handler);
      return () => tracesSocket.off("trace.updated", handler);
    },
  };

  const logsRealtime: LogsSocket = {
    socket: logsSocket,
    onLogCreated(handler) {
      logsSocket.on("log.created", handler);
      return () => logsSocket.off("log.created", handler);
    },
  };

  const configRealtime: ConfigSocket = {
    socket: configSocket,
    onConfigUpdated(handler) {
      configSocket.on("config.updated", handler);
      return () => configSocket.off("config.updated", handler);
    },
  };

  return {
    http: {
      chatSessions: {
        list: () => ChatSessionsService.chatSessionsControllerList(),
        create: (input) => ChatSessionsService.chatSessionsControllerCreate(input),
        get: (id) => ChatSessionsService.chatSessionsControllerGet(id),
        archive: (id) => ChatSessionsService.chatSessionsControllerArchive(id),
        listMessages: (id) => ChatSessionsService.chatSessionsControllerListMessages(id),
        createMessage: (id, input) =>
          ChatSessionsService.chatSessionsControllerCreateMessage(id, input),
      },
      traces: {
        list: () => TracesService.tracesControllerList(),
        get: (id) => TracesService.tracesControllerGet(id),
      },
      logs: {
        list: () => LogsService.logsControllerList(),
        emit: () => LogsService.logsControllerEmit(),
      },
      config: {
        get: () => ConfigService.runtimeConfigControllerGet(),
        update: (input) => ConfigService.runtimeConfigControllerUpdate(input),
      },
    },
    sockets: {
      chatSessions: chatSessionsSocket,
      traces: tracesRealtime,
      logs: logsRealtime,
      config: configRealtime,
    },
    updateAuth(nextApiKey) {
      currentApiKey = nextApiKey ?? null;
      applyHttpAuth();
      const headers = resolveHeaders();
      sockets.forEach((socket) => applySocketAuth(socket, headers));
    },
    dispose() {
      sockets.forEach((socket) => socket.disconnect());
    },
  };
}

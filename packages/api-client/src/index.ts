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

export type ConfigFileFormat = "yaml" | "json";

export interface EddieProviderConfigDto {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  version?: string;
}

export interface EddieContextConfigDto {
  baseDir?: string;
  include?: string[];
  exclude?: string[];
}

export interface EddieToolsConfigDto {
  enabled?: string[];
  autoApprove?: boolean;
}

export interface EddieAgentsManagerDto {
  prompt?: string;
}

export interface EddieAgentsConfigDto {
  mode?: string;
  manager?: EddieAgentsManagerDto;
  enableSubagents?: boolean;
}

export interface EddieConfigDto {
  model?: string;
  provider?: EddieProviderConfigDto;
  context?: EddieContextConfigDto;
  systemPrompt?: string;
  tools?: EddieToolsConfigDto;
  agents?: EddieAgentsConfigDto;
  logging?: { level?: string };
}

export type EddieConfigInputDto = EddieConfigDto;

export interface EddieConfigSchemaDto {
  id: string;
  version: string;
  schema: Record<string, unknown>;
  inputSchema: Record<string, unknown>;
}

export interface EddieConfigPreviewDto {
  input: EddieConfigInputDto;
  config: EddieConfigDto;
}

export interface EddieConfigSourceDto extends EddieConfigPreviewDto {
  path: string | null;
  format: ConfigFileFormat;
  content: string;
}

export interface UpdateEddieConfigPayload {
  content: string;
  format: ConfigFileFormat;
  path?: string | null;
}

export interface ChatSessionTemplateDto {
  id: string;
  name: string;
  provider: string;
  model: string;
  prompt: string;
  createdAt: string;
}

export interface ChatLayoutPreferencesDto {
  selectedSessionId?: string;
  collapsedPanels?: Record<string, boolean>;
  sessionSettings?: Record<
    string,
    {
      provider?: string;
      model?: string;
    }
  >;
  templates?: Record<string, ChatSessionTemplateDto>;
}

export interface LayoutPreferencesDto {
  chat?: ChatLayoutPreferencesDto;
  updatedAt?: string;
}

export type ToolCallStatusDto = "pending" | "running" | "completed" | "failed";

export interface OrchestratorContextBundleDto {
  id: string;
  label: string;
  summary?: string;
  sizeBytes: number;
  fileCount: number;
}

export interface OrchestratorToolCallNodeDto {
  id: string;
  name: string;
  status: ToolCallStatusDto;
  metadata?: Record<string, unknown>;
  children: OrchestratorToolCallNodeDto[];
}

export interface OrchestratorAgentNodeDto {
  id: string;
  name: string;
  provider?: string;
  model?: string;
  depth?: number;
  metadata?: Record<string, unknown>;
  children: OrchestratorAgentNodeDto[];
}

export interface OrchestratorMetadataDto {
  contextBundles: OrchestratorContextBundleDto[];
  toolInvocations: OrchestratorToolCallNodeDto[];
  agentHierarchy: OrchestratorAgentNodeDto[];
  sessionId?: string;
  capturedAt?: string;
}

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
      getSchema(): Promise<EddieConfigSchemaDto>;
      loadEddieConfig(): Promise<EddieConfigSourceDto>;
      previewEddieConfig(
        payload: UpdateEddieConfigPayload
      ): Promise<EddieConfigPreviewDto>;
      saveEddieConfig(
        payload: UpdateEddieConfigPayload
      ): Promise<EddieConfigSourceDto>;
    };
    preferences: {
      getLayout(): Promise<LayoutPreferencesDto>;
      updateLayout(input: LayoutPreferencesDto): Promise<LayoutPreferencesDto>;
    };
    orchestrator: {
      getMetadata(sessionId?: string): Promise<OrchestratorMetadataDto>;
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

  const createDefaultPreferences = (): LayoutPreferencesDto => ({
    chat: { collapsedPanels: {} },
    updatedAt: new Date().toISOString(),
  });

  const performRequest = async <T>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> => {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...resolveHeaders(),
    };

    if (init.body !== undefined && !(init.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    if (init.headers) {
      Object.assign(headers, init.headers as Record<string, string>);
    }

    const response = await fetch(`${httpBase}${path}`, {
      ...init,
      headers,
    });

    if (response.status === 204) {
      return undefined as T;
    }

    if (!response.ok) {
      const error = new Error(
        `Request to ${path} failed with status ${response.status}`
      );
      (error as { status?: number }).status = response.status;
      (error as { body?: string }).body = await response.text();
      throw error;
    }

    if (response.headers.get("content-length") === "0") {
      return undefined as T;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as T;
    }

    return (await response.text()) as T;
  };

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
        getSchema: () =>
          performRequest<EddieConfigSchemaDto>("/config/schema"),
        loadEddieConfig: () =>
          performRequest<EddieConfigSourceDto>("/config/editor"),
        previewEddieConfig: (payload) =>
          performRequest<EddieConfigPreviewDto>("/config/editor/preview", {
            method: "POST",
            body: JSON.stringify(payload),
          }),
        saveEddieConfig: (payload) =>
          performRequest<EddieConfigSourceDto>("/config/editor", {
            method: "PUT",
            body: JSON.stringify(payload),
          }),
      },
      preferences: {
        async getLayout() {
          try {
            return await performRequest<LayoutPreferencesDto>(
              "/user/preferences/layout"
            );
          } catch (error) {
            const status = (error as { status?: number }).status;
            if (status === 404) {
              return createDefaultPreferences();
            }
            throw error;
          }
        },
        updateLayout: (input) =>
          performRequest<LayoutPreferencesDto>("/user/preferences/layout", {
            method: "PUT",
            body: JSON.stringify(input ?? {}),
          }),
      },
      orchestrator: {
        getMetadata: (sessionId) =>
          performRequest<OrchestratorMetadataDto>(
            sessionId
              ? `/orchestrator/metadata?sessionId=${encodeURIComponent(sessionId)}`
              : "/orchestrator/metadata"
          ),
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

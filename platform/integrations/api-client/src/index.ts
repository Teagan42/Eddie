import type { ExecutionTreeState } from "@eddie/types";
import { createRealtimeChannel, type RealtimeChannel } from "./realtime";
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
import type { UpdateChatSessionDto } from "./generated/models/UpdateChatSessionDto";

export type {
  ChatSessionDto,
  ChatMessageDto,
  CreateChatSessionDto,
  CreateChatMessageDto,
  TraceDto,
  LogEntryDto,
  RuntimeConfigDto,
  UpdateRuntimeConfigDto,
  UpdateChatSessionDto,
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
    logging?: { level?: string; };
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

export interface ProviderCatalogEntryDto {
    name: string;
    label?: string;
    models: string[];
}

export const FALLBACK_PROVIDER_CATALOG: ProviderCatalogEntryDto[] = [
  {
    name: "openai",
    label: "OpenAI",
    models: [ "gpt-4o", "gpt-4o-mini" ],
  },
  {
    name: "anthropic",
    label: "Anthropic Claude",
    models: [
      "claude-3-5-sonnet-latest",
      "claude-3-5-haiku-latest",
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
      "claude-3-haiku-20240307",
    ],
  },
  {
    name: "openai_compatible",
    label: "OpenAI Compatible",
    models: [],
  },
];

export interface EddieConfigSourceDto {
    path: string | null;
    format: ConfigFileFormat;
    content: string;
    input: EddieConfigInputDto;
    config?: EddieConfigDto | null;
    error?: string | null;
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

export interface OrchestratorContextBundleFileDto {
    path: string;
    sizeBytes: number;
    preview?: string;
}

export interface OrchestratorContextBundleDto {
    id: string;
    label: string;
    summary?: string;
    sizeBytes: number;
    fileCount: number;
    files?: OrchestratorContextBundleFileDto[];
}

export interface OrchestratorAgentMetadataDto
    extends Record<string, unknown> {
    finalMessage?: string;
    transcriptSummary?: string;
    historySnippet?: string;
    contextBundleIds?: string[];
}

export interface OrchestratorToolCallNodeDto {
    id: string;
    name: string;
    status: ToolCallStatusDto;
    metadata?: OrchestratorAgentMetadataDto;
    children: OrchestratorToolCallNodeDto[];
}

export interface OrchestratorAgentNodeDto {
    id: string;
    name: string;
    provider?: string;
    model?: string;
    depth?: number;
    metadata?: OrchestratorAgentMetadataDto;
    children: OrchestratorAgentNodeDto[];
}

export interface OrchestratorMetadataDto {
    contextBundles: OrchestratorContextBundleDto[];
    toolInvocations: OrchestratorToolCallNodeDto[];
    agentHierarchy: OrchestratorAgentNodeDto[];
    sessionId?: string;
    capturedAt?: string;
}

export type AgentActivityStateDto = "idle" | "thinking" | "tool" | "tool-error" | "error";

export interface AgentActivityEventDto {
    sessionId: string;
    state: AgentActivityStateDto;
    timestamp?: string;
}

export interface ChatMessageReasoningPartialPayload {
    sessionId: string;
    messageId: string;
    text: string;
    metadata?: Record<string, unknown>;
    timestamp?: string;
    agentId?: string | null;
    responseId?: string;
}

export interface ChatMessageReasoningCompletePayload {
    sessionId: string;
    messageId: string;
    responseId?: string;
    text?: string;
    metadata?: Record<string, unknown>;
    timestamp?: string;
    agentId?: string | null;
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
    onSessionDeleted(handler: (sessionId: string) => void): Unsubscribe;
    onMessageCreated(handler: (message: ChatMessageDto) => void): Unsubscribe;
    onMessageUpdated(handler: (message: ChatMessageDto) => void): Unsubscribe;
    onAgentActivity(
        handler: (activity: AgentActivityEventDto) => void
    ): Unsubscribe;
    onExecutionTreeUpdated(
        handler: (
            payload: { sessionId: string; state: ExecutionTreeState }
        ) => void
    ): Unsubscribe;
    emitMessage(sessionId: string, payload: CreateChatMessageDto): void;
}

export interface ChatMessageReasoningPayload {
    sessionId: string;
    messageId: string;
    text?: string;
    metadata?: Record<string, unknown> | undefined;
    timestamp?: string | undefined;
    agentId?: string | null | undefined;
    responseId?: string | undefined;
}

type ChatMessageReasoningPartialEvent = {
    sessionId: string;
    messageId: string;
    text: string;
    metadata?: Record<string, unknown> | undefined;
    timestamp?: string | undefined;
    agentId?: string | null | undefined;
};

type ChatMessageReasoningCompleteEvent = {
    sessionId: string;
    messageId: string;
    responseId?: string | undefined;
    text?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
    timestamp?: string | undefined;
    agentId?: string | null | undefined;
};

type ChatMessageReasoningEvent =
    | ChatMessageReasoningPartialEvent
    | ChatMessageReasoningCompleteEvent;

export interface ChatMessagesSocket {
    onMessagePartial(handler: (message: ChatMessageDto) => void): Unsubscribe;
    onReasoningPartial(
        handler: (payload: ChatMessageReasoningPartialPayload) => void,
    ): Unsubscribe;
    onReasoningComplete(
        handler: (payload: ChatMessageReasoningCompletePayload) => void,
    ): Unsubscribe;
}

export interface TracesSocket {
    onTraceCreated(handler: (trace: TraceDto) => void): Unsubscribe;
    onTraceUpdated(handler: (trace: TraceDto) => void): Unsubscribe;
}

export interface LogsSocket {
    onLogCreated(handler: (entry: LogEntryDto) => void): Unsubscribe;
}

export interface LogsListOptions {
    offset?: number;
    limit?: number;
}

const DEFAULT_LOGS_OFFSET = 0;
const DEFAULT_LOGS_LIMIT = 50;

export interface ConfigSocket {
    onConfigUpdated(handler: (config: RuntimeConfigDto) => void): Unsubscribe;
}

export interface ApiClient {
    http: {
        chatSessions: {
            list(): Promise<ChatSessionDto[]>;
            create(input: CreateChatSessionDto): Promise<ChatSessionDto>;
            get(id: string): Promise<ChatSessionDto>;
            rename(id: string, input: UpdateChatSessionDto): Promise<ChatSessionDto>;
            delete(id: string): Promise<void>;
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
            list(params?: LogsListOptions): Promise<LogEntryDto[]>;
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
        providers: {
            catalog(): Promise<ProviderCatalogEntryDto[]>;
        };
        preferences: {
            getLayout(): Promise<LayoutPreferencesDto>;
            updateLayout(input: LayoutPreferencesDto): Promise<LayoutPreferencesDto>;
        };
        orchestrator: {
            getMetadata(sessionId?: string): Promise<OrchestratorMetadataDto>;
            getExecutionState(
                sessionId: string
            ): Promise<ExecutionTreeState | null>;
        };
    };
    sockets: {
        chatSessions: ChatSessionsSocket;
        chatMessages: ChatMessagesSocket;
        traces: TracesSocket;
        logs: LogsSocket;
        config: ConfigSocket;
        tools?: {
            onToolCall(handler: (payload: unknown) => void): Unsubscribe;
            onToolResult(handler: (payload: unknown) => void): Unsubscribe;
        };
    };
    updateAuth(apiKey?: string): void;
    dispose(): void;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/u, "");
}

function toReasoningPayload(
  payload: ChatMessageReasoningEvent
): ChatMessageReasoningPayload {
  return {
    sessionId: payload.sessionId,
    messageId: payload.messageId,
    text: payload.text,
    metadata: payload.metadata,
    timestamp: payload.timestamp,
    agentId: payload.agentId,
    responseId: "responseId" in payload ? payload.responseId : undefined,
  };
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

  const chatChannel = createRealtimeChannel(wsBase, "/chat-sessions", currentApiKey);
  const chatMessagesChannel = createRealtimeChannel(wsBase, "/chat-messages", currentApiKey);
  const tracesChannel = createRealtimeChannel(wsBase, "/traces", currentApiKey);
  const logsChannel = createRealtimeChannel(wsBase, "/logs", currentApiKey);
  const configChannel = createRealtimeChannel(wsBase, "/config", currentApiKey);
  const toolsChannel = createRealtimeChannel(wsBase, "/tools", currentApiKey);

  const channels: RealtimeChannel[] = [
    chatChannel,
    chatMessagesChannel,
    tracesChannel,
    logsChannel,
    configChannel,
    toolsChannel,
  ];

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
      headers[ "Content-Type" ] = "application/json";
    }

    if (init.headers) {
      Object.assign(headers, init.headers as Record<string, string>);
    }

    const response = await fetch(`${ httpBase }${ path }`, {
      ...init,
      headers,
    });

    if (response.status === 204) {
      return undefined as T;
    }

    if (!response.ok) {
      const error = new Error(
        `Request to ${ path } failed with status ${ response.status }`
      );
      (error as { status?: number; }).status = response.status;
      (error as { body?: string; }).body = await response.text();
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

  const coerceSessionId = (payload: unknown): string | null => {
    if (typeof payload === "string") {
      return payload;
    }

    if (
      payload &&
      typeof payload === "object" &&
      "id" in (payload as { id?: unknown }) &&
      typeof (payload as { id?: unknown }).id === "string"
    ) {
      return (payload as { id: string }).id;
    }

    return null;
  };

  const coerceExecutionTreeUpdate = (
    payload: unknown
  ): { sessionId: string; state: ExecutionTreeState } | null => {
    if (
      payload &&
      typeof payload === "object" &&
      "sessionId" in (payload as { sessionId?: unknown }) &&
      typeof (payload as { sessionId?: unknown }).sessionId === "string" &&
      "state" in (payload as { state?: unknown }) &&
      (payload as { state?: unknown }).state !== null &&
      typeof (payload as { state?: unknown }).state === "object"
    ) {
      return {
        sessionId: (payload as { sessionId: string }).sessionId,
        state: (payload as { state: ExecutionTreeState }).state,
      };
    }

    return null;
  };

  const coercePlainRecord = (
    value: unknown,
  ): Record<string, unknown> | undefined => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return undefined;
  };

  const coerceAgentId = (value: unknown): string | null | undefined => {
    if (typeof value === "string") {
      return value;
    }

    if (value === null) {
      return null;
    }

    return undefined;
  };

  const coerceResponseId = (value: unknown): string | undefined => {
    if (typeof value === "string") {
      return value;
    }

    return undefined;
  };

  const coerceReasoningPartialPayload = (
    payload: unknown,
  ): ChatMessageReasoningPartialPayload | null => {
    if (
      payload &&
      typeof payload === "object" &&
      "sessionId" in (payload as { sessionId?: unknown }) &&
      typeof (payload as { sessionId?: unknown }).sessionId === "string" &&
      "messageId" in (payload as { messageId?: unknown }) &&
      typeof (payload as { messageId?: unknown }).messageId === "string" &&
      "text" in (payload as { text?: unknown }) &&
      typeof (payload as { text?: unknown }).text === "string"
    ) {
      return {
        sessionId: (payload as { sessionId: string }).sessionId,
        messageId: (payload as { messageId: string }).messageId,
        text: (payload as { text: string }).text,
        metadata: coercePlainRecord(
          (payload as { metadata?: unknown }).metadata,
        ),
        timestamp:
          typeof (payload as { timestamp?: unknown }).timestamp === "string"
            ? (payload as { timestamp: string }).timestamp
            : undefined,
        agentId: coerceAgentId((payload as { agentId?: unknown }).agentId),
        responseId: coerceResponseId(
          (payload as { responseId?: unknown }).responseId,
        ),
      };
    }

    return null;
  };

  const coerceReasoningCompletePayload = (
    payload: unknown,
  ): ChatMessageReasoningCompletePayload | null => {
    if (
      payload &&
      typeof payload === "object" &&
      "sessionId" in (payload as { sessionId?: unknown }) &&
      typeof (payload as { sessionId?: unknown }).sessionId === "string" &&
      "messageId" in (payload as { messageId?: unknown }) &&
      typeof (payload as { messageId?: unknown }).messageId === "string"
    ) {
      return {
        sessionId: (payload as { sessionId: string }).sessionId,
        messageId: (payload as { messageId: string }).messageId,
        responseId: coerceResponseId(
          (payload as { responseId?: unknown }).responseId,
        ),
        text:
          typeof (payload as { text?: unknown }).text === "string"
            ? (payload as { text: string }).text
            : undefined,
        metadata: coercePlainRecord(
          (payload as { metadata?: unknown }).metadata,
        ),
        timestamp:
          typeof (payload as { timestamp?: unknown }).timestamp === "string"
            ? (payload as { timestamp: string }).timestamp
            : undefined,
        agentId: coerceAgentId((payload as { agentId?: unknown }).agentId),
      };
    }

    return null;
  };

  const chatSessionsSocket: ChatSessionsSocket = {
    onSessionCreated(handler) {
      return chatChannel.on("session.created", handler);
    },
    onSessionUpdated(handler) {
      return chatChannel.on("session.updated", handler);
    },
    onSessionDeleted(handler) {
      return chatChannel.on("session.deleted", (payload: unknown) => {
        const id = coerceSessionId(payload);
        if (id) {
          handler(id);
        }
      });
    },
    onMessageCreated(handler) {
      return chatChannel.on("message.created", handler);
    },
    onMessageUpdated(handler) {
      return chatChannel.on("message.updated", handler);
    },
    onAgentActivity(handler) {
      return chatChannel.on("agent.activity", handler);
    },
    onExecutionTreeUpdated(handler) {
      return chatChannel.on(
        "execution-tree.updated",
        (payload: unknown) => {
          const update = coerceExecutionTreeUpdate(payload);
          if (update) {
            handler(update);
          }
        }
      );
    },
    emitMessage(sessionId, payload) {
      chatChannel.emit("message.send", { sessionId, message: payload });
    },
  };

  const chatMessagesRealtime: ChatMessagesSocket = {
    onMessagePartial(handler) {
      return chatMessagesChannel.on("message.partial", handler);
    },
    onReasoningPartial(handler) {
      return chatMessagesChannel.on(
        "message.reasoning.partial",
        (payload: unknown) => {
          const update = coerceReasoningPartialPayload(payload);
          if (update) {
            handler(update);
          }
        },
      );
    },
    onReasoningComplete(handler) {
      return chatMessagesChannel.on(
        "message.reasoning.completed",
        (payload: unknown) => {
          const update = coerceReasoningCompletePayload(payload);
          if (update) {
            handler(update);
          }
        },
      );
    },
  };

  const tracesRealtime: TracesSocket = {
    onTraceCreated(handler) {
      return tracesChannel.on("trace.created", handler);
    },
    onTraceUpdated(handler) {
      return tracesChannel.on("trace.updated", handler);
    },
  };

  const logsRealtime: LogsSocket = {
    onLogCreated(handler) {
      return logsChannel.on(
        "logs.created",
        (entries: LogEntryDto[] | LogEntryDto) => {
          const batch = Array.isArray(entries) ? entries : [ entries ];
          batch.forEach((entry) => handler(entry));
        }
      );
    },
  };

  const configRealtime: ConfigSocket = {
    onConfigUpdated(handler) {
      return configChannel.on("config.updated", handler);
    },
  };

  const toolsRealtime = {
    onToolCall(handler: (payload: unknown) => void) {
      return toolsChannel.on("tool.call", handler);
    },
    onToolResult(handler: (payload: unknown) => void) {
      return toolsChannel.on("tool.result", handler);
    },
  };

  return {
    http: {
      chatSessions: {
        list: () => ChatSessionsService.chatSessionsControllerList(),
        create: (input) => ChatSessionsService.chatSessionsControllerCreate(input),
        get: (id) => ChatSessionsService.chatSessionsControllerGet(id),
        rename: (id, input) =>
          ChatSessionsService.chatSessionsControllerRename(id, input),
        delete: (id) => ChatSessionsService.chatSessionsControllerDelete(id),
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
        list: (params?: LogsListOptions) =>
          LogsService.logsControllerList(
            params?.offset ?? DEFAULT_LOGS_OFFSET,
            params?.limit ?? DEFAULT_LOGS_LIMIT
          ),
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
      providers: {
        catalog: async () => {
          try {
            return await performRequest<ProviderCatalogEntryDto[]>(
              "/providers/catalog"
            );
          } catch (error) {
            const status = (error as { status?: number; }).status;
            if (status === 404 || error instanceof TypeError) {
              return FALLBACK_PROVIDER_CATALOG;
            }
            throw error;
          }
        },
      },
      preferences: {
        async getLayout() {
          try {
            return await performRequest<LayoutPreferencesDto>(
              "/user/preferences/layout"
            );
          } catch (error) {
            const status = (error as { status?: number; }).status;
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
              ? `/orchestrator/metadata?sessionId=${ encodeURIComponent(sessionId) }`
              : "/orchestrator/metadata"
          ),
        getExecutionState: async (sessionId) => {
          if (!sessionId) {
            return null;
          }

          try {
            return await performRequest<ExecutionTreeState>(
              `/orchestrator/execution-state?sessionId=${ encodeURIComponent(sessionId) }`
            );
          } catch (error) {
            const status = (error as { status?: number; }).status;
            if (status === 404) {
              return null;
            }
            throw error;
          }
        },
      },
    },
    sockets: {
      chatSessions: chatSessionsSocket,
      chatMessages: chatMessagesRealtime,
      traces: tracesRealtime,
      logs: logsRealtime,
      config: configRealtime,
      tools: toolsRealtime,
    },
    updateAuth(nextApiKey) {
      currentApiKey = nextApiKey ?? null;
      applyHttpAuth();
      channels.forEach((channel) => channel.updateAuth(currentApiKey));
    },
    dispose() {
      channels.forEach((channel) => channel.close());
    },
  };
}

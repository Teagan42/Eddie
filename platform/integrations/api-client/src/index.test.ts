import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import {
  FALLBACK_PROVIDER_CATALOG,
  type ProviderCatalogEntryDto,
  type UpdateChatSessionDto,
  createApiClient,
} from "./index";
import { OpenAPI } from "./generated/core/OpenAPI";
import { CreateChatMessageDto } from "./generated/models/CreateChatMessageDto";
import { LogsService } from "./generated/services/LogsService";
import { ChatSessionsService } from "./generated/services/ChatSessionsService";
import { ChatSessionDto } from "./generated/models/ChatSessionDto";

vi.mock("./realtime", () => ({ createRealtimeChannel: vi.fn() }));

import { createRealtimeChannel } from "./realtime";
import type { RealtimeChannel, RealtimeHandler } from "./realtime";

type Handler = RealtimeHandler<unknown>;

class MockChannel implements RealtimeChannel {
  public readonly handlers = new Map<string, Set<Handler>>();
  public readonly on: Mock<RealtimeChannel[ "on" ]>;
  public readonly emit: Mock<RealtimeChannel[ "emit" ]> = vi.fn();
  public readonly updateAuth: Mock<RealtimeChannel[ "updateAuth" ]> = vi.fn();
  public readonly close: Mock<RealtimeChannel[ "close" ]> = vi.fn();

  constructor(
        public readonly baseUrl: string,
        public readonly namespace: string,
        public readonly apiKey: string | null
  ) {
    this.on = vi.fn<RealtimeChannel[ "on" ]>(
      (event, handler): (() => void) => {
        const typedHandler = handler as Handler;
        const handlers = this.handlers.get(event) ?? new Set<Handler>();
        handlers.add(typedHandler);
        this.handlers.set(event, handlers);
        return () => {
          const current = this.handlers.get(event);
          if (!current) {
            return;
          }
          current.delete(typedHandler);
          if (current.size === 0) {
            this.handlers.delete(event);
          }
        };
      }
    );
  }
}

const createdChannels: MockChannel[] = [];
const realtimeMock =
    createRealtimeChannel as unknown as Mock<
        (baseUrl: string, namespace: string, apiKey: string | null) => RealtimeChannel
    >;

const overrideServiceMethod = (
  service: Record<string, unknown>,
  key: string,
  implementation: (...args: unknown[]) => unknown
): (() => void) => {
  const original = service[ key ];
  service[ key ] = implementation;
  return () => {
    if (typeof original === "function") {
      service[ key ] = original;
    } else {
      delete service[ key ];
    }
  };
};

describe("createApiClient", () => {
  beforeEach(() => {
    OpenAPI.BASE = "";
    OpenAPI.HEADERS = undefined;
    OpenAPI.TOKEN = undefined;
    createdChannels.splice(0, createdChannels.length);
    realtimeMock.mockReset();
    realtimeMock.mockImplementation(
      (baseUrl: string, namespace: string, apiKey: string | null) => {
        const channel = new MockChannel(baseUrl, namespace, apiKey);
        createdChannels.push(channel);
        return channel;
      }
    );
  });

  it("configures OpenAPI and realtime channels", async () => {
    const client = createApiClient({
      baseUrl: "https://example.test/api/",
      websocketUrl: "ws://example.test/ws/",
    });

    expect(OpenAPI.BASE).toBe("https://example.test/api");
    expect(realtimeMock).toHaveBeenCalledTimes(6);
    expect(createdChannels.map((channel) => channel.namespace)).toEqual([
      "/chat-sessions",
      "/chat-messages",
      "/traces",
      "/logs",
      "/config",
      "/tools",
    ]);
    createdChannels.forEach((channel) => {
      expect(channel.baseUrl).toBe("ws://example.test/ws");
      expect(channel.apiKey).toBeNull();
    });

    const chatChannel = createdChannels[ 0 ]!;
    const chatMessagesChannel = createdChannels[ 1 ]!;
    const sessionCreated = vi.fn();
    const unsubscribeSessionCreated =
            client.sockets.chatSessions.onSessionCreated(sessionCreated);
    expect(chatChannel.on).toHaveBeenCalledWith(
      "session.created",
      sessionCreated
    );

    const sessionDeleted = vi.fn();
    const unsubscribeSessionDeleted =
            client.sockets.chatSessions.onSessionDeleted(sessionDeleted);
    const sessionDeletedCalls = chatChannel.on.mock.calls.filter(
      (call) => call[ 0 ] === "session.deleted"
    );
    expect(sessionDeletedCalls).toHaveLength(1);
    const [, sessionDeletedHandler] = sessionDeletedCalls[ 0 ]!;
    expect(typeof sessionDeletedHandler).toBe("function");

    const messageCreated = vi.fn();
    const unsubscribeMessageCreated =
            client.sockets.chatSessions.onMessageCreated(messageCreated);
    expect(chatChannel.on).toHaveBeenCalledWith(
      "message.created",
      messageCreated
    );

    const messageUpdated = vi.fn();
    const unsubscribeMessageUpdated =
            client.sockets.chatSessions.onMessageUpdated(messageUpdated);
    expect(chatChannel.on).toHaveBeenCalledWith(
      "message.updated",
      messageUpdated
    );

    const executionTreeUpdated = vi.fn();
    const unsubscribeExecutionTreeUpdated =
            client.sockets.chatSessions.onExecutionTreeUpdated(
              executionTreeUpdated
            );
    const executionTreeUpdatedCalls = chatChannel.on.mock.calls.filter(
      (call) => call[ 0 ] === "execution-tree.updated"
    );
    expect(executionTreeUpdatedCalls).toHaveLength(1);
    const [, executionTreeHandler] = executionTreeUpdatedCalls[ 0 ]!;
    expect(typeof executionTreeHandler).toBe("function");

    executionTreeHandler?.({
      sessionId: "session-1",
      state: { nodes: [] },
    });

    expect(executionTreeUpdated).toHaveBeenCalledWith({
      sessionId: "session-1",
      state: { nodes: [] },
    });

    chatChannel.emit.mockClear();
    client.sockets.chatSessions.emitMessage("session-1", {
      role: CreateChatMessageDto.role.USER,
      content: "hi",
    });
    expect(chatChannel.emit).toHaveBeenCalledWith("message.send", {
      sessionId: "session-1",
      message: {
        role: CreateChatMessageDto.role.USER,
        content: "hi",
      },
    });

    const partialHandler = vi.fn();
    const unsubscribePartial = client.sockets.chatMessages.onMessagePartial(
      partialHandler
    );
    expect(chatMessagesChannel.on).toHaveBeenCalledWith(
      "message.partial",
      partialHandler
    );

    const deletedHandlers = chatChannel.handlers.get("session.deleted");
    deletedHandlers?.forEach((handler) =>
      handler({ id: "session-1" } as unknown as ChatSessionDto)
    );
    expect(sessionDeleted).toHaveBeenCalledWith("session-1");

    unsubscribeSessionCreated();
    expect(chatChannel.handlers.get("session.created")?.size ?? 0).toBe(0);
    unsubscribeSessionDeleted();
    expect(chatChannel.handlers.get("session.deleted")?.size ?? 0).toBe(0);
    unsubscribeMessageCreated();
    expect(chatChannel.handlers.get("message.created")?.size ?? 0).toBe(0);
    unsubscribeMessageUpdated();
    expect(chatChannel.handlers.get("message.updated")?.size ?? 0).toBe(0);
    unsubscribeExecutionTreeUpdated();
    expect(
      chatChannel.handlers.get("execution-tree.updated")?.size ?? 0
    ).toBe(0);
    unsubscribePartial();
    expect(
      chatMessagesChannel.handlers.get("message.partial")?.size ?? 0
    ).toBe(0);

    client.updateAuth("secret");

    const headersResolver = OpenAPI.HEADERS;
    const headers =
            typeof headersResolver === "function"
              ? await headersResolver({ method: "GET" } as never)
              : {};
    expect(headers).toHaveProperty("x-api-key", "secret");

    createdChannels.forEach((channel) => {
      expect(channel.updateAuth).toHaveBeenCalledWith("secret");
    });

    client.dispose();
    createdChannels.forEach((channel) => {
      expect(channel.close).toHaveBeenCalledTimes(1);
    });
  });

  it("fans out batched log events to the consumer", () => {
    const client = createApiClient({
      baseUrl: "https://example.test/api/",
      websocketUrl: "ws://example.test/ws/",
    });

    const logsChannel = createdChannels[ 3 ]!;
    const handler = vi.fn();

    const unsubscribe = client.sockets.logs.onLogCreated(handler);

    const logHandlers = logsChannel.handlers.get("logs.created");
    expect(logHandlers?.size).toBe(1);

    const [ registeredHandler ] = [ ...(logHandlers ?? []) ];
    expect(typeof registeredHandler).toBe("function");

    const batch = [
      { id: "1", level: "info", message: "one", createdAt: "now" },
      { id: "2", level: "warn", message: "two", createdAt: "later" },
    ];

    registeredHandler?.(batch);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, batch[ 0 ]);
    expect(handler).toHaveBeenNthCalledWith(2, batch[ 1 ]);

    unsubscribe();
    expect(logsChannel.handlers.get("logs.created")?.size ?? 0).toBe(0);

    client.dispose();
  });

  it("passes pagination parameters to the logs HTTP client", () => {
    const logsService = LogsService as unknown as Record<string, unknown>;
    const listMock = vi.fn().mockResolvedValue([]);
    const restoreList = overrideServiceMethod(
      logsService,
      "logsControllerList",
      listMock
    );

    const client = createApiClient({
      baseUrl: "https://example.test/api/",
      websocketUrl: "ws://example.test/ws/",
    });

    client.http.logs.list({ offset: 40, limit: 20 });

    expect(listMock).toHaveBeenCalledWith(40, 20);

    restoreList();
    client.dispose();
  });

  it("uses default pagination when list options are omitted", () => {
    const logsService = LogsService as unknown as Record<string, unknown>;
    const listMock = vi.fn().mockResolvedValue([]);
    const restoreList = overrideServiceMethod(
      logsService,
      "logsControllerList",
      listMock
    );

    const client = createApiClient({
      baseUrl: "https://example.test/api/",
      websocketUrl: "ws://example.test/ws/",
    });

    client.http.logs.list();

    expect(listMock).toHaveBeenCalledWith(0, 50);

    restoreList();
    client.dispose();
  });

  it("normalizes relative websocket URLs", () => {
    createApiClient({ baseUrl: "/api", websocketUrl: "/api/" }).dispose();

    expect(realtimeMock).toHaveBeenCalledTimes(6);
    realtimeMock.mock.calls.forEach(([ baseUrl ]) => {
      expect(baseUrl).toBe("/api");
    });
  });

  it("returns the fallback provider catalog when the endpoint is missing", async () => {
    const text = vi.fn().mockResolvedValue("Not Found");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        status: 404,
        ok: false,
        headers: { get: () => null },
        text,
      } as never);

    const client = createApiClient({
      baseUrl: "https://example.test/api/",
      websocketUrl: "ws://example.test/ws/",
    });

    await expect(client.http.providers.catalog()).resolves.toEqual(
      FALLBACK_PROVIDER_CATALOG
    );
    expect(text).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
    client.dispose();
  });

  it("returns the fallback provider catalog when the request fails", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("Failed to fetch"));

    const client = createApiClient({
      baseUrl: "https://example.test/api/",
      websocketUrl: "ws://example.test/ws/",
    });

    await expect(client.http.providers.catalog()).resolves.toEqual(
      FALLBACK_PROVIDER_CATALOG
    );

    fetchSpy.mockRestore();
    client.dispose();
  });

  it("propagates non-404 catalog errors", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        status: 500,
        ok: false,
        headers: { get: () => null },
        text: vi.fn().mockResolvedValue("Server error"),
      } as never);

    const client = createApiClient({
      baseUrl: "https://example.test/api/",
      websocketUrl: "ws://example.test/ws/",
    });

    await expect(client.http.providers.catalog()).rejects.toThrow(
      /status 500/
    );

    fetchSpy.mockRestore();
    client.dispose();
  });

  it("returns catalog responses from the server when available", async () => {
    const payload: ProviderCatalogEntryDto[] = [
      { name: "api-provider", label: "API Provider", models: [ "model-a" ] },
    ];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        status: 200,
        ok: true,
        headers: {
          get: (key: string) =>
            key === "content-type" ? "application/json" : null,
        },
        json: vi.fn().mockResolvedValue(payload),
      } as never);

    const client = createApiClient({
      baseUrl: "https://example.test/api/",
      websocketUrl: "ws://example.test/ws/",
    });

    await expect(client.http.providers.catalog()).resolves.toEqual(payload);

    fetchSpy.mockRestore();
    client.dispose();
  });

  it("renames chat sessions via the generated service", async () => {
    const renameResult = { id: "session-1" };
    const renameMock = vi.fn().mockResolvedValue(renameResult);
    const restoreRename = overrideServiceMethod(
      ChatSessionsService as unknown as Record<string, unknown>,
      "chatSessionsControllerRename",
      renameMock
    );

    const client = createApiClient({
      baseUrl: "https://example.test/api/",
      websocketUrl: "ws://example.test/ws/",
    });

    const payload: UpdateChatSessionDto = { title: "New" };

    await expect(
      client.http.chatSessions.rename("session-1", payload)
    ).resolves.toBe(renameResult);

    expect(renameMock).toHaveBeenCalledWith("session-1", payload);

    client.dispose();
    restoreRename();
  });

  it("deletes chat sessions via the generated service", async () => {
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    const restoreDelete = overrideServiceMethod(
      ChatSessionsService as unknown as Record<string, unknown>,
      "chatSessionsControllerDelete",
      deleteMock
    );

    const client = createApiClient({
      baseUrl: "https://example.test/api/",
      websocketUrl: "ws://example.test/ws/",
    });

    await expect(client.http.chatSessions.delete("session-2")).resolves.toBe(
      undefined
    );

    expect(deleteMock).toHaveBeenCalledWith("session-2");

    client.dispose();
    restoreDelete();
  });
});

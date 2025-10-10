import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { createApiClient } from "./index";
import { OpenAPI } from "./generated/core/OpenAPI";
import { CreateChatMessageDto } from "./generated/models/CreateChatMessageDto";

vi.mock("./realtime", () => ({ createRealtimeChannel: vi.fn() }));

import { createRealtimeChannel } from "./realtime";
import type { RealtimeChannel, RealtimeHandler } from "./realtime";

type Handler = RealtimeHandler<unknown>;

class MockChannel implements RealtimeChannel {
  public readonly on: RealtimeChannel["on"] = vi.fn(
    <T>(event: string, handler: RealtimeHandler<T>): (() => void) => {
      const handlers =
        this.handlers.get(event) ?? new Set<RealtimeHandler<unknown>>();
      handlers.add(handler as Handler);
      this.handlers.set(event, handlers);
      return () => {
        const current = this.handlers.get(event);
        if (!current) {
          return;
        }
        current.delete(handler as Handler);
        if (current.size === 0) {
          this.handlers.delete(event);
        }
      };
    }
  );
  public readonly emit: Mock<RealtimeChannel["emit"]> = vi.fn();
  public readonly updateAuth: Mock<RealtimeChannel["updateAuth"]> = vi.fn();
  public readonly close: Mock<RealtimeChannel["close"]> = vi.fn();
  public readonly handlers = new Map<string, Set<Handler>>();

  constructor(
    public readonly baseUrl: string,
    public readonly namespace: string,
    public readonly apiKey: string | null
  ) {}
}

const createdChannels: MockChannel[] = [];
const realtimeMock =
  createRealtimeChannel as unknown as Mock<
    (baseUrl: string, namespace: string, apiKey: string | null) => RealtimeChannel
  >;

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
    expect(realtimeMock).toHaveBeenCalledTimes(4);
    expect(createdChannels.map((channel) => channel.namespace)).toEqual([
      "/chat-sessions",
      "/traces",
      "/logs",
      "/config",
    ]);
    createdChannels.forEach((channel) => {
      expect(channel.baseUrl).toBe("ws://example.test/ws");
      expect(channel.apiKey).toBeNull();
    });

    const chatChannel = createdChannels[0]!;
    const sessionCreated = vi.fn();
    const unsubscribe = client.sockets.chatSessions.onSessionCreated(
      sessionCreated
    );
    expect(chatChannel.on).toHaveBeenCalledWith(
      "session.created",
      sessionCreated
    );

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

    const messageUpdated = vi.fn();
    const unsubscribeUpdate = client.sockets.chatSessions.onMessageUpdated(
      messageUpdated
    );
    expect(chatChannel.on).toHaveBeenCalledWith(
      "message.updated",
      messageUpdated
    );

    unsubscribe();
    expect(chatChannel.handlers.get("session.created")?.size ?? 0).toBe(0);
    unsubscribeUpdate();
    expect(chatChannel.handlers.get("message.updated")?.size ?? 0).toBe(0);

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

    const logsChannel = createdChannels[2]!;
    const handler = vi.fn();

    const unsubscribe = client.sockets.logs.onLogCreated(handler);

    const logHandlers = logsChannel.handlers.get("logs.created");
    expect(logHandlers?.size).toBe(1);

    const [registeredHandler] = [...(logHandlers ?? [])];
    expect(typeof registeredHandler).toBe("function");

    const batch = [
      { id: "1", level: "info", message: "one", createdAt: "now" },
      { id: "2", level: "warn", message: "two", createdAt: "later" },
    ];

    registeredHandler?.(batch);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, batch[0]);
    expect(handler).toHaveBeenNthCalledWith(2, batch[1]);

    unsubscribe();
    expect(logsChannel.handlers.get("logs.created")?.size ?? 0).toBe(0);

    client.dispose();
  });

  it("normalizes relative websocket URLs", () => {
    createApiClient({ baseUrl: "/api", websocketUrl: "/api/" }).dispose();

    expect(realtimeMock).toHaveBeenCalledTimes(4);
    realtimeMock.mock.calls.forEach(([baseUrl]) => {
      expect(baseUrl).toBe("/api");
    });
  });
});

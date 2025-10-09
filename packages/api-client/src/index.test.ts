import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./index";
import { OpenAPI } from "./generated/core/OpenAPI";

vi.mock("./realtime", () => ({ createRealtimeChannel: vi.fn() }));

import { createRealtimeChannel } from "./realtime";

type Handler = (payload: unknown) => void;

class MockChannel {
  public readonly on = vi.fn(
    (event: string, handler: Handler): (() => void) => {
      const handlers = this.handlers.get(event) ?? new Set<Handler>();
      handlers.add(handler);
      this.handlers.set(event, handlers);
      return () => {
        const current = this.handlers.get(event);
        if (!current) {
          return;
        }
        current.delete(handler);
        if (current.size === 0) {
          this.handlers.delete(event);
        }
      };
    }
  );
  public readonly emit = vi.fn();
  public readonly updateAuth = vi.fn();
  public readonly close = vi.fn();
  public readonly handlers = new Map<string, Set<Handler>>();

  constructor(
    public readonly baseUrl: string,
    public readonly namespace: string,
    public readonly apiKey: string | null
  ) {}
}

const createdChannels: MockChannel[] = [];
const realtimeMock = createRealtimeChannel as unknown as vi.Mock;

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
    client.sockets.chatSessions.emitMessage("session-1", { role: "user", content: "hi" });
    expect(chatChannel.emit).toHaveBeenCalledWith("message.send", {
      sessionId: "session-1",
      message: { role: "user", content: "hi" },
    });

    unsubscribe();
    expect(chatChannel.handlers.get("session.created")?.size ?? 0).toBe(0);

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

  it("normalizes relative websocket URLs", () => {
    createApiClient({ baseUrl: "/api", websocketUrl: "/api/" }).dispose();

    expect(realtimeMock).toHaveBeenCalledTimes(4);
    realtimeMock.mock.calls.forEach(([baseUrl]) => {
      expect(baseUrl).toBe("/api");
    });
  });
});

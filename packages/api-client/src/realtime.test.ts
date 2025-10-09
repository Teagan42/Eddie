import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRealtimeChannel } from "./realtime";

type MessageHandler = (event: { data: unknown }) => void;

const { TestWebSocket } = vi.hoisted(() => {
  class TestWebSocket {
    public static CONNECTING = 0;
    public static OPEN = 1;
    public static CLOSING = 2;
    public static CLOSED = 3;
    public static instances: TestWebSocket[] = [];

    public readyState = TestWebSocket.CONNECTING;
    public onopen: (() => void) | null = null;
    public onmessage: MessageHandler | null = null;
    public onclose: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public sent: string[] = [];

    constructor(public readonly url: string) {
      TestWebSocket.instances.push(this);
    }

    open(): void {
      this.readyState = TestWebSocket.OPEN;
      this.onopen?.();
    }

    send(payload: string): void {
      this.sent.push(payload);
    }

    close(): void {
      this.readyState = TestWebSocket.CLOSED;
      this.onclose?.();
    }
  }

  return { TestWebSocket };
});

vi.mock("isomorphic-ws", () => ({ default: TestWebSocket }));

describe("createRealtimeChannel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestWebSocket.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("joins URLs and flushes queued messages on open", () => {
    const channel = createRealtimeChannel(
      "ws://example.test/ws/",
      "/chat",
      null
    );

    expect(TestWebSocket.instances).toHaveLength(1);
    const socket = TestWebSocket.instances[0]!;
    expect(socket.url).toBe("ws://example.test/ws/chat");

    channel.emit("event", { hello: "world" });
    expect(socket.sent).toEqual([]);

    socket.open();
    expect(socket.sent).toEqual([
      JSON.stringify({ event: "event", data: { hello: "world" } }),
    ]);

    const handler = vi.fn();
    channel.on("event", handler);
    socket.onmessage?.({ data: JSON.stringify({ event: "event", data: 42 }) });
    expect(handler).toHaveBeenCalledWith(42);

    channel.close();
    expect(socket.readyState).toBe(TestWebSocket.CLOSED);
  });

  it("reconnects with updated credentials", () => {
    const channel = createRealtimeChannel("/api", "/logs", null);
    const first = TestWebSocket.instances[0]!;
    expect(first.url).toBe("/api/logs");

    first.open();
    channel.updateAuth("secret");

    expect(TestWebSocket.instances).toHaveLength(2);
    const second = TestWebSocket.instances[1]!;
    expect(second.url).toBe("/api/logs?apiKey=secret");
    expect(first.readyState).toBe(TestWebSocket.CLOSED);

    channel.close();
  });

  it("schedules reconnects when the socket closes unexpectedly", () => {
    const channel = createRealtimeChannel("ws://host/ws", "/config", null);
    const first = TestWebSocket.instances[0]!;
    first.open();
    first.onclose?.();

    expect(TestWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(1000);
    expect(TestWebSocket.instances).toHaveLength(2);

    channel.close();
  });
});

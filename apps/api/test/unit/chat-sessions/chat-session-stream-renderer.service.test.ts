import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import { ChatSessionStreamRendererService } from "../../../src/chat-sessions/chat-session-stream-renderer.service";
import type { ChatMessagesGateway } from "../../../src/chat-sessions/chat-messages.gateway";
import { InMemoryChatSessionsRepository } from "../../../src/chat-sessions/chat-sessions.repository";

describe("ChatSessionStreamRendererService", () => {
  let service: ChatSessionsService;
  let renderer: ChatSessionStreamRendererService;
  let sessionId: string;
  let gateway: ChatMessagesGateway;

  beforeEach(() => {
    service = new ChatSessionsService(new InMemoryChatSessionsRepository());
    gateway = { emitPartial: vi.fn() } as unknown as ChatMessagesGateway;
    renderer = new ChatSessionStreamRendererService(service, gateway);
    sessionId = service.createSession({ title: "Stream" }).id;
  });

  it("creates and updates assistant messages from deltas", async () => {
    const capture = await renderer.capture(sessionId, async () => {
      renderer.render({ type: "delta", text: "Hello" });
      renderer.render({ type: "delta", text: " world" });
      renderer.render({ type: "end" });
      return "ok";
    });

    expect(capture.error).toBeUndefined();
    expect(capture.result).toBe("ok");
    expect(capture.state.messageId).toBeDefined();

    const messages = service.listMessages(sessionId);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("assistant");
    expect(messages[0]?.content).toBe("Hello world");
  });

  it("does not create messages when no deltas are rendered", async () => {
    const capture = await renderer.capture(sessionId, async () => {
      renderer.render({ type: "notification", payload: "noop" });
      renderer.render({ type: "end" });
    });

    expect(capture.error).toBeUndefined();
    expect(capture.state.messageId).toBeUndefined();
    expect(service.listMessages(sessionId)).toEqual([]);
  });

  it("preserves streamed content when the engine run fails", async () => {
    const capture = await renderer.capture(sessionId, async () => {
      renderer.render({ type: "delta", text: "Partial" });
      throw new Error("boom");
    });

    expect(capture.error).toBeInstanceOf(Error);
    expect(capture.state.messageId).toBeDefined();
    const messages = service.listMessages(sessionId);
    expect(messages[0]?.content).toBe("Partial");
  });

  it("emits partial updates for assistant responses", async () => {
    const events: string[] = [];
    const emitPartialMock = gateway.emitPartial as unknown as ReturnType<typeof vi.fn>;
    emitPartialMock.mockImplementation((message: { content: string }) =>
      events.push(message.content)
    );

    await renderer.capture(sessionId, async () => {
      renderer.render({ type: "delta", text: "Hello" });
      renderer.render({ type: "delta", text: " world" });
    });

    expect(events).toEqual(["Hello", "Hello world"]);
  });

  it("streams tool call and result messages as they arrive", async () => {
    await renderer.capture(sessionId, async () => {
      renderer.render({
        type: "tool_call",
        id: "call-1",
        name: "bash",
        arguments: { command: "echo hello" },
      });
      renderer.render({
        type: "tool_result",
        id: "call-1",
        name: "bash",
        result: {
          schema: "eddie.tool.bash.result.v1",
          content: "echo hello",
          data: { exitCode: 0 },
        },
      });
    });

    const messages = service.listMessages(sessionId);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: "assistant",
      name: "bash",
      toolCallId: "call-1",
      content: "",
    });

    expect(messages[1]).toMatchObject({
      role: "tool",
      name: "bash",
      toolCallId: "call-1",
    });

    const payload = JSON.parse(messages[1]?.content ?? "{}") as {
      schema?: string;
      content?: string;
      data?: { exitCode?: number };
    };

    expect(payload).toMatchObject({
      schema: "eddie.tool.bash.result.v1",
      content: "echo hello",
      data: { exitCode: 0 },
    });
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import { ChatSessionStreamRendererService } from "../../../src/chat-sessions/chat-session-stream-renderer.service";

describe("ChatSessionStreamRendererService", () => {
  let service: ChatSessionsService;
  let renderer: ChatSessionStreamRendererService;
  let sessionId: string;

  beforeEach(() => {
    service = new ChatSessionsService();
    renderer = new ChatSessionStreamRendererService(service);
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
});

import { describe, expect, it, vi } from "vitest";
import { AgentStreamEvent } from "@eddie/types";
import type { ChatSessionStreamRendererService } from "../../../src/chat-sessions/chat-session-stream-renderer.service";
import { AgentStreamEventHandler } from "../../../src/chat-sessions/agent-stream-event.handler";

describe("AgentStreamEventHandler", () => {
  it("renders chat session stream events", () => {
    const render = vi.fn();
    const handler = new AgentStreamEventHandler(
      { render } as unknown as ChatSessionStreamRendererService,
    );

    const event = new AgentStreamEvent({ type: "delta", text: "hello" });

    handler.handle(event);

    expect(render).toHaveBeenCalledWith(event.event);
  });
});

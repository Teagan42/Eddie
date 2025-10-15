import { describe, expect, it, vi } from "vitest";
import { AgentStreamEvent } from "@eddie/types";
import type { StreamRendererService } from "../src/stream-renderer.service";
import { AgentStreamEventHandler } from "../src/agent-stream-event.handler";

describe("AgentStreamEventHandler", () => {
  it("forwards agent stream events to the stream renderer", () => {
    const render = vi.fn();
    const handler = new AgentStreamEventHandler(
      { render } as unknown as StreamRendererService,
    );

    const event = new AgentStreamEvent({ type: "delta", text: "hi" });

    handler.handle(event);

    expect(render).toHaveBeenCalledWith(event.event);
  });
});

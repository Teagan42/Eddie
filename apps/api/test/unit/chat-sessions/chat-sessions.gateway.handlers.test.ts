import { describe, expect, it, vi } from "vitest";
import { ChatSessionCreatedEvent } from "@eddie/types";
import { ChatSessionCreatedEventHandler } from "../../../src/chat-sessions/events";
import type { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import type { ChatSessionsGateway } from "../../../src/chat-sessions/chat-sessions.gateway";

describe("ChatSessionCreatedEventHandler", () => {
  it("loads the session and emits it through the gateway", () => {
    const session = { id: "s1" };
    const service = { getSession: vi.fn().mockReturnValue(session) } as unknown as ChatSessionsService;
    const gateway = { emitSessionCreated: vi.fn() } as unknown as ChatSessionsGateway;
    const handler = new ChatSessionCreatedEventHandler(service, gateway);

    handler.handle(new ChatSessionCreatedEvent("s1"));

    expect((service.getSession as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("s1");
    expect((gateway.emitSessionCreated as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(session);
  });
});

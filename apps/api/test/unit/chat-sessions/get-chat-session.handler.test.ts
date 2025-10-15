import { describe, expect, it, vi } from "vitest";
import { GetChatSessionQuery } from "../../../src/chat-sessions/queries/get-chat-session.query";
import { GetChatSessionHandler } from "../../../src/chat-sessions/queries/get-chat-session.handler";
import type { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";

describe("GetChatSessionHandler", () => {
  it("retrieves a chat session from the service", async () => {
    const service = {
      getSession: vi.fn().mockResolvedValue({ id: "session" }),
    } as unknown as ChatSessionsService;

    const handler = new GetChatSessionHandler(service);
    const query = new GetChatSessionQuery("session-123");

    await expect(handler.execute(query)).resolves.toEqual({ id: "session" });
    expect(service.getSession).toHaveBeenCalledWith("session-123");
  });
});

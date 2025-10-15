import { describe, expect, it, vi } from "vitest";
import { DeleteChatSessionCommand } from "../../../src/chat-sessions/commands/delete-chat-session.command";
import { DeleteChatSessionHandler } from "../../../src/chat-sessions/commands/delete-chat-session.handler";
import type { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";

describe("DeleteChatSessionHandler", () => {
  it("removes the chat session through the service", async () => {
    const service = {
      deleteSession: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatSessionsService;

    const handler = new DeleteChatSessionHandler(service);
    const command = new DeleteChatSessionCommand("session-123");

    await expect(handler.execute(command)).resolves.toBeUndefined();
    expect(service.deleteSession).toHaveBeenCalledWith("session-123");
  });
});

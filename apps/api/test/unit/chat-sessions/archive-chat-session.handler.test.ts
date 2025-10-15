import { describe, expect, it, vi } from "vitest";
import { ArchiveChatSessionCommand } from "../../../src/chat-sessions/commands/archive-chat-session.command";
import { ArchiveChatSessionHandler } from "../../../src/chat-sessions/commands/archive-chat-session.handler";
import type { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";

describe("ArchiveChatSessionHandler", () => {
  it("archives chat sessions through the service", async () => {
    const archived = { id: "session-1" };
    const service = {
      archiveSession: vi.fn().mockResolvedValue(archived),
    } as unknown as ChatSessionsService;

    const handler = new ArchiveChatSessionHandler(service);
    const command = new ArchiveChatSessionCommand("session-1");

    await expect(handler.execute(command)).resolves.toBe(archived);
    expect(service.archiveSession).toHaveBeenCalledWith("session-1");
  });
});

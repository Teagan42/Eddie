import { describe, expect, it, vi } from "vitest";
import { UpdateChatSessionCommand } from "../../../src/chat-sessions/commands/update-chat-session.command";
import { UpdateChatSessionHandler } from "../../../src/chat-sessions/commands/update-chat-session.handler";
import type { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import type { UpdateChatSessionDto } from "../../../src/chat-sessions/dto/update-chat-session.dto";

describe("UpdateChatSessionHandler", () => {
  it("updates chat session metadata through the service", async () => {
    const service = {
      renameSession: vi.fn().mockResolvedValue({ id: "session" }),
    } as unknown as ChatSessionsService;

    const handler = new UpdateChatSessionHandler(service);
    const dto: UpdateChatSessionDto = { title: "Renamed" };
    const command = new UpdateChatSessionCommand("session-123", dto);

    await expect(handler.execute(command)).resolves.toEqual({ id: "session" });
    expect(service.renameSession).toHaveBeenCalledWith("session-123", dto);
  });
});

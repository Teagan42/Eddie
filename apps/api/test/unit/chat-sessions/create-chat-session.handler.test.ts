import { describe, expect, it, vi } from "vitest";
import { CreateChatSessionCommand } from "../../../src/chat-sessions/commands/create-chat-session.command";
import { CreateChatSessionHandler } from "../../../src/chat-sessions/commands/create-chat-session.handler";
import type { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import type { CreateChatSessionDto } from "../../../src/chat-sessions/dto/create-chat-session.dto";

describe("CreateChatSessionHandler", () => {
  it("creates a session through the chat sessions service", async () => {
    const service = {
      createSession: vi.fn().mockResolvedValue({ id: "session" }),
    } as unknown as ChatSessionsService;

    const handler = new CreateChatSessionHandler(service);

    const dto: CreateChatSessionDto = {
      title: "Test Session",
      description: "A session created from tests",
    };

    const command = new CreateChatSessionCommand(dto);

    await expect(handler.execute(command)).resolves.toEqual({ id: "session" });
    expect(service.createSession).toHaveBeenCalledWith(dto);
  });
});

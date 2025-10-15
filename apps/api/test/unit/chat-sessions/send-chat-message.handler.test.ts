import { describe, expect, it, vi } from "vitest";
import { SendChatMessageCommand } from "../../../src/chat-sessions/commands/send-chat-message.command";
import { SendChatMessageHandler } from "../../../src/chat-sessions/commands/send-chat-message.handler";
import type { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import type { CreateChatMessageDto } from "../../../src/chat-sessions/dto/create-chat-message.dto";

describe("SendChatMessageHandler", () => {
  it("appends a chat message through the chat sessions service", async () => {
    const service = {
      addMessage: vi.fn().mockResolvedValue({ message: { id: "msg" } }),
    } as unknown as ChatSessionsService;

    const handler = new SendChatMessageHandler(service);
    const dto: CreateChatMessageDto = {
      role: "user",
      content: "Hello",
    };
    const command = new SendChatMessageCommand("session-123", dto);

    await expect(handler.execute(command)).resolves.toEqual({
      message: { id: "msg" },
    });
    expect(service.addMessage).toHaveBeenCalledWith("session-123", dto);
  });
});

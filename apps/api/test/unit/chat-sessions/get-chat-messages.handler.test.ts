import { describe, expect, it, vi } from "vitest";
import { GetChatMessagesQuery } from "../../../src/chat-sessions/queries/get-chat-messages.query";
import { GetChatMessagesHandler } from "../../../src/chat-sessions/queries/get-chat-messages.handler";
import type { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";

describe("GetChatMessagesHandler", () => {
  it("lists chat messages through the service", async () => {
    const service = {
      listMessages: vi.fn().mockResolvedValue([{ id: "message" }]),
    } as unknown as ChatSessionsService;

    const handler = new GetChatMessagesHandler(service);
    const query = new GetChatMessagesQuery("session-123");

    await expect(handler.execute(query)).resolves.toEqual([{ id: "message" }]);
    expect(service.listMessages).toHaveBeenCalledWith("session-123");
  });
});

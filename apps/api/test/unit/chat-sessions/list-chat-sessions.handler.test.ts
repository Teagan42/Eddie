import { describe, expect, it, vi } from "vitest";
import { ListChatSessionsQuery } from "../../../src/chat-sessions/queries/list-chat-sessions.query";
import { ListChatSessionsHandler } from "../../../src/chat-sessions/queries/list-chat-sessions.handler";
import type { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";

describe("ListChatSessionsHandler", () => {
  it("lists sessions via the service", async () => {
    const sessions = [
      { id: "session-1" },
      { id: "session-2" },
    ];
    const service = {
      listSessions: vi.fn().mockResolvedValue(sessions),
    } as unknown as ChatSessionsService;

    const handler = new ListChatSessionsHandler(service);

    await expect(handler.execute(new ListChatSessionsQuery())).resolves.toBe(
      sessions
    );
    expect(service.listSessions).toHaveBeenCalledWith();
  });
});

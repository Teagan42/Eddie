import { describe, expect, it } from "vitest";
import type { ChatMessageDto, ChatSessionDto } from "@eddie/api-client";
import type { SessionSummary } from "@eddie/ui/overview";

import { mapChatMessageDtos, mapChatSessionDtos } from "./overview-mappers";

describe("overview DTO mappers", () => {
  it("maps chat session DTOs to overview session summaries", () => {
    const sessions: ChatSessionDto[] = [
      {
        id: "session-1",
        title: "My Session",
        description: "notes",
        status: "active",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T01:02:03.000Z",
      },
    ];

    const mapped = mapChatSessionDtos(sessions);

    const expected: SessionSummary[] = [
      {
        id: "session-1",
        updatedAt: "2024-01-01T01:02:03.000Z",
        title: "My Session",
      },
    ];

    expect(mapped).toEqual(expected);
  });

  it("maps chat message DTOs to UI chat messages", () => {
    const messages: ChatMessageDto[] = [
      {
        id: "message-1",
        sessionId: "session-1",
        role: "assistant",
        content: "Hello",
        createdAt: "2024-01-01T00:00:05.000Z",
        toolCallId: "tool-1",
        name: "Responder",
      },
    ];

    const mapped = mapChatMessageDtos(messages);

    const expected: ChatMessage[] = [
      {
        id: "message-1",
        sessionId: "session-1",
        role: "assistant",
        content: "Hello",
        createdAt: "2024-01-01T00:00:05.000Z",
        toolCallId: "tool-1",
        name: "Responder",
      },
    ];

    expect(mapped).toEqual(expected);
  });
});

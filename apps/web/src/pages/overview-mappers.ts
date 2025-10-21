import type { ChatMessageDto, ChatSessionDto } from "@eddie/api-client";
import type { SessionSummary } from "@eddie/ui/overview";

export function mapChatSessionDtos(
  sessions: ChatSessionDto[] | undefined,
): readonly SessionSummary[] | undefined {
  if (!sessions) {
    return undefined;
  }

  return sessions.map(({ id, title, updatedAt }) => ({
    id,
    title,
    updatedAt,
  }));
}

export function mapChatMessageDtos(
  messages: ChatMessageDto[] | undefined,
): readonly ChatMessage[] | undefined {
  if (!messages) {
    return undefined;
  }

  return messages.map(({ id, sessionId, role, content, createdAt, toolCallId, name }) => ({
    id,
    sessionId,
    role,
    content,
    createdAt,
    toolCallId: toolCallId ?? null,
    name: name ?? null,
  }));
}

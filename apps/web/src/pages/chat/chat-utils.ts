import type { ChatMessageDto, ChatSessionDto } from "@eddie/api-client";

export function sortSessions(sessions: ChatSessionDto[]): ChatSessionDto[] {
  return sessions
    .slice()
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
}

export function upsertMessage(
  messages: ChatMessageDto[],
  next: ChatMessageDto
): ChatMessageDto[] {
  const exists = messages.some((message) => message.id === next.id);
  const collection = exists
    ? messages.map((message) =>
      message.id === next.id ? { ...message, ...next } : message
    )
    : [...messages, next];

  return collection.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export function summarizeObject(obj: unknown, maxLen = 200): string | null {
  try {
    if (obj == null) return null;
    if (typeof obj === "string") {
      return obj.length > maxLen ? obj.slice(0, maxLen) + "…" : obj;
    }

    const serialized = JSON.stringify(obj);
    return serialized.length > maxLen
      ? serialized.slice(0, maxLen) + "…"
      : serialized;
  } catch {
    return null;
  }
}

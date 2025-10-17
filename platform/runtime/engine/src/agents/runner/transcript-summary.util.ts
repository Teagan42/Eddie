import type { ChatMessage } from "@eddie/types";

const formatMessage = (message: ChatMessage): string | undefined => {
  const trimmed = message.content.trim();
  if (!trimmed) {
    return undefined;
  }

  const role = message.role === "user" ? "User" : "Assistant";
  return `${ role }: ${ trimmed }`;
};

export const createTranscriptSummary = (
  messages: ChatMessage[],
): string | undefined => {
  const relevant = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => formatMessage(message))
    .filter((value): value is string => Boolean(value));

  if (relevant.length === 0) {
    return undefined;
  }

  const snippet = relevant.slice(-2).join(" | ");
  return snippet.length > 280 ? `${ snippet.slice(0, 277) }...` : snippet;
};

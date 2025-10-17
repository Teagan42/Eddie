import type { ChatMessage } from "@eddie/types";

export const cloneHistory = (messages: ChatMessage[]): ChatMessage[] =>
  messages.map((message) => ({ ...message }));

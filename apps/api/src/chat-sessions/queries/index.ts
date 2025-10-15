import { GetChatMessagesHandler } from "./get-chat-messages.handler";
import { GetChatSessionHandler } from "./get-chat-session.handler";

export const chatSessionQueryHandlers = [
  GetChatSessionHandler,
  GetChatMessagesHandler,
] as const;

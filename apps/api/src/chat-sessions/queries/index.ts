import { GetChatMessagesHandler } from "./get-chat-messages.handler";
import { GetChatSessionHandler } from "./get-chat-session.handler";
import { ListChatSessionsHandler } from "./list-chat-sessions.handler";

export const chatSessionQueryHandlers = [
  GetChatSessionHandler,
  GetChatMessagesHandler,
  ListChatSessionsHandler,
] as const;

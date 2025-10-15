import { CreateChatSessionHandler } from "./create-chat-session.handler";
import { DeleteChatSessionHandler } from "./delete-chat-session.handler";
import { SendChatMessageHandler } from "./send-chat-message.handler";
import { UpdateChatSessionHandler } from "./update-chat-session.handler";
import { ArchiveChatSessionHandler } from "./archive-chat-session.handler";

export const chatSessionCommandHandlers = [
  CreateChatSessionHandler,
  SendChatMessageHandler,
  UpdateChatSessionHandler,
  DeleteChatSessionHandler,
  ArchiveChatSessionHandler,
] as const;

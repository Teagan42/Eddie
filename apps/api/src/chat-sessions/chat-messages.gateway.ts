import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server } from "ws";
import { emitEvent } from "../websocket/utils";
import { ChatMessageDto } from "./dto/chat-session.dto";

@WebSocketGateway({ path: "/chat-messages" })
export class ChatMessagesGateway {
  @WebSocketServer()
  private server!: Server;

  emitPartial(message: ChatMessageDto): void {
    emitEvent(this.server, "message.partial", message);
  }

  emitReasoningPartial(payload: {
    sessionId: string;
    messageId: string;
    text: string;
    metadata: Record<string, unknown> | undefined;
    timestamp: string | undefined;
    agentId: string | null;
  }): void {
    emitEvent(this.server, "message.reasoning.partial", payload);
  }

  emitReasoningComplete(payload: {
    sessionId: string;
    messageId: string;
    responseId: string | undefined;
    metadata: Record<string, unknown> | undefined;
    timestamp: string | undefined;
    agentId: string | null;
  }): void {
    emitEvent(this.server, "message.reasoning.completed", payload);
  }
}

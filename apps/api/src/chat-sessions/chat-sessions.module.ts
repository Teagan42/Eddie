import { Module } from "@nestjs/common";
import { ChatSessionsService } from "./chat-sessions.service";
import { ChatSessionsController } from "./chat-sessions.controller";
import { ChatSessionsGateway } from "./chat-sessions.gateway";

@Module({
  providers: [ChatSessionsService, ChatSessionsGateway],
  controllers: [ChatSessionsController],
  exports: [ChatSessionsService],
})
export class ChatSessionsModule {}

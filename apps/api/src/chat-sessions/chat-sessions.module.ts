import { Module } from "@nestjs/common";
import { EngineModule } from "@eddie/engine";
import { ChatSessionsService } from "./chat-sessions.service";
import { ChatSessionsController } from "./chat-sessions.controller";
import { ChatSessionsGateway } from "./chat-sessions.gateway";
import { ChatSessionsEngineListener } from "./chat-sessions-engine.listener";

@Module({
  imports: [EngineModule],
  providers: [
    ChatSessionsService,
    ChatSessionsGateway,
    ChatSessionsEngineListener,
  ],
  controllers: [ChatSessionsController],
  exports: [ChatSessionsService],
})
export class ChatSessionsModule {}

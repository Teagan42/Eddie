import { Module } from "@nestjs/common";
import { EngineModule } from "@eddie/engine";
import { TracesModule } from "../traces/traces.module";
import { LogsModule } from "../logs/logs.module";
import { ChatSessionsService } from "./chat-sessions.service";
import { ChatSessionsController } from "./chat-sessions.controller";
import { ChatSessionsGateway } from "./chat-sessions.gateway";
import { ChatSessionsEngineListener } from "./chat-sessions-engine.listener";

@Module({
  imports: [EngineModule, TracesModule, LogsModule],
  providers: [
    ChatSessionsService,
    ChatSessionsGateway,
    ChatSessionsEngineListener,
  ],
  controllers: [ChatSessionsController],
  exports: [ChatSessionsService],
})
export class ChatSessionsModule {
  constructor(
    // Ensures the engine listener is instantiated so it can self-register
    private readonly _engineListener: ChatSessionsEngineListener
  ) {}
}

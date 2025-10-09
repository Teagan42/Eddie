import { Module } from "@nestjs/common";
import { ChatSessionsModule } from "../chat-sessions/chat-sessions.module";
import { OrchestratorController } from "./orchestrator.controller";
import { OrchestratorMetadataService } from "./orchestrator.service";

@Module({
  imports: [ChatSessionsModule],
  controllers: [OrchestratorController],
  providers: [OrchestratorMetadataService],
  exports: [OrchestratorMetadataService],
})
export class OrchestratorModule {}

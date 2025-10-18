import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { ChatSessionsModule } from "../chat-sessions/chat-sessions.module";
import { OrchestratorController } from "./orchestrator.controller";
import { OrchestratorMetadataService } from "./orchestrator.service";
import { ExecutionTreeStateStore } from "./execution-tree-state.store";

@Module({
  imports: [ChatSessionsModule, CqrsModule],
  controllers: [OrchestratorController],
  providers: [OrchestratorMetadataService, ExecutionTreeStateStore],
  exports: [OrchestratorMetadataService],
})
export class OrchestratorModule {}

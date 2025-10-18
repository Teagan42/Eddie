import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { OrchestratorController } from "./orchestrator.controller";
import { OrchestratorMetadataService } from "./orchestrator.service";
import { ExecutionTreeStateStore } from "./execution-tree-state.store";
import { ExecutionTreeStateUpdatedEventsHandler } from "./execution-tree-state.events-handler";

@Module({
  imports: [CqrsModule],
  controllers: [OrchestratorController],
  providers: [
    ExecutionTreeStateStore,
    OrchestratorMetadataService,
    ExecutionTreeStateUpdatedEventsHandler,
  ],
  exports: [OrchestratorMetadataService],
})
export class OrchestratorModule {}

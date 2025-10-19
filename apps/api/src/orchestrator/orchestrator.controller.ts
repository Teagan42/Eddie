import { Controller, Get, NotFoundException, Query } from "@nestjs/common";
import { ApiQuery, ApiTags } from "@nestjs/swagger";
import { OrchestratorMetadataDto } from "./dto/orchestrator-metadata.dto";
import { OrchestratorMetadataService } from "./orchestrator.service";
import { ExecutionTreeStateStore } from "./execution-tree-state.store";
import type { ExecutionTreeState } from "@eddie/types";

@ApiTags("orchestrator")
@Controller("orchestrator")
export class OrchestratorController {
  constructor(
    private readonly service: OrchestratorMetadataService,
    private readonly executionTreeStateStore: ExecutionTreeStateStore,
  ) {}

  @Get("metadata")
  @ApiQuery({ name: "sessionId", required: false })
  async getMetadata(
    @Query("sessionId") sessionId?: string
  ): Promise<OrchestratorMetadataDto> {
    return this.service.getMetadata(sessionId);
  }

  @Get("execution-state")
  @ApiQuery({ name: "sessionId", required: true })
  getExecutionState(
    @Query("sessionId") sessionId?: string
  ): ExecutionTreeState {
    if (!sessionId) {
      throw new NotFoundException("Execution state requires a session id");
    }

    const state = this.executionTreeStateStore.get(sessionId);
    if (!state) {
      throw new NotFoundException(
        `No execution state recorded for session ${sessionId}`,
      );
    }

    return state;
  }
}

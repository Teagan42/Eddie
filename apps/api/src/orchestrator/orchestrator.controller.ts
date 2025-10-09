import { Controller, Get, Query } from "@nestjs/common";
import { ApiQuery, ApiTags } from "@nestjs/swagger";
import { OrchestratorMetadataDto } from "./dto/orchestrator-metadata.dto";
import { OrchestratorMetadataService } from "./orchestrator.service";

@ApiTags("orchestrator")
@Controller("orchestrator")
export class OrchestratorController {
  constructor(private readonly service: OrchestratorMetadataService) {}

  @Get("metadata")
  @ApiQuery({ name: "sessionId", required: false })
  getMetadata(@Query("sessionId") sessionId?: string): OrchestratorMetadataDto {
    return this.service.getMetadata(sessionId);
  }
}

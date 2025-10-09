import { Module } from "@nestjs/common";
import { TracesService } from "./traces.service";
import { TracesController } from "./traces.controller";
import { TracesGateway } from "./traces.gateway";

@Module({
  providers: [TracesService, TracesGateway],
  controllers: [TracesController],
  exports: [TracesService],
})
export class TracesModule {}

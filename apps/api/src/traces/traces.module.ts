import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { traceCommandHandlers } from "./commands";
import { traceQueryHandlers } from "./queries";
import { TracesService } from "./traces.service";
import { TracesController } from "./traces.controller";
import { TracesGateway } from "./traces.gateway";
import { TracesGatewayEventsHandler } from "./traces.gateway.events-handler";

@Module({
  imports: [CqrsModule],
  providers: [
    TracesService,
    TracesGateway,
    TracesGatewayEventsHandler,
    ...traceCommandHandlers,
    ...traceQueryHandlers,
  ],
  controllers: [TracesController],
})
export class TracesModule {}

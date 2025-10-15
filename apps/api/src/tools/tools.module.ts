import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { ToolsGateway } from "./tools.gateway";
import { ToolCallStore } from "./tool-call.store";
import { toolCommandHandlers } from "./commands";
import { toolQueryHandlers } from "./queries";
import { ToolCallsGatewayEventsHandler } from "./tool-calls-gateway.events-handler";

@Module({
  imports: [ CqrsModule ],
  providers: [
    ToolCallStore,
    ToolsGateway,
    ToolCallsGatewayEventsHandler,
    ...toolCommandHandlers,
    ...toolQueryHandlers,
  ],
  exports: [ ToolCallStore, ToolsGateway ],
})
export class ToolsModule { }

import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { ToolsGateway } from "./tools.gateway";
import { ToolCallStore } from "./tool-call.store";
import { toolCommandHandlers } from "./commands";
import { toolQueryHandlers } from "./queries";
import { ToolCallsGatewayEventsHandler } from "./tool-calls-gateway.events-handler";
import { ToolCallPersistenceService } from "./tool-call.persistence";
import { DatabaseModule } from "../persistence/database.module";

@Module({
  imports: [ CqrsModule, DatabaseModule ],
  providers: [
    ToolCallStore,
    ToolCallPersistenceService,
    ToolsGateway,
    ToolCallsGatewayEventsHandler,
    ...toolCommandHandlers,
    ...toolQueryHandlers,
  ],
  exports: [ ToolCallStore, ToolsGateway ],
})
export class ToolsModule { }

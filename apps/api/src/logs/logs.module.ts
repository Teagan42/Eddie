import { Module } from "@nestjs/common";
import { IoModule } from "@eddie/io";
import { LogsService } from "./logs.service";
import { LogsController } from "./logs.controller";
import { LogsGateway } from "./logs.gateway";
import { LogsForwarderService } from "./logs-forwarder.service";
import { ToolsModule } from "../tools/tools.module";

@Module({
    imports: [ IoModule, ToolsModule ],
    providers: [ LogsService, LogsGateway, LogsForwarderService ],
    controllers: [ LogsController ],
    exports: [ LogsService ],
})
export class LogsModule { }

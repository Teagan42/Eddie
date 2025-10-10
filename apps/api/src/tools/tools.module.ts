import { Module } from "@nestjs/common";
import { ToolsGateway } from "./tools.gateway";

@Module({
    providers: [ ToolsGateway ],
    exports: [ ToolsGateway ],
})
export class ToolsModule { }

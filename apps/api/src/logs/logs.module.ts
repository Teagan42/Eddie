import { Module } from "@nestjs/common";
import { LogsService } from "./logs.service";
import { LogsController } from "./logs.controller";
import { LogsGateway } from "./logs.gateway";
import { LogsForwarderService } from "./logs-forwarder.service";

@Module({
  providers: [LogsService, LogsGateway, LogsForwarderService],
  controllers: [LogsController],
  exports: [LogsService],
})
export class LogsModule {}

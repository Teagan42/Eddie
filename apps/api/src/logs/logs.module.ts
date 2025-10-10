import { Module } from "@nestjs/common";
import { IoModule } from "@eddie/io";
import { LogsService } from "./logs.service";
import { LogsController } from "./logs.controller";
import { LogsGateway } from "./logs.gateway";
import { LogsForwarderService } from "./logs-forwarder.service";

@Module({
  imports: [IoModule],
  providers: [LogsService, LogsGateway, LogsForwarderService],
  controllers: [LogsController],
  exports: [LogsService],
})
export class LogsModule {}

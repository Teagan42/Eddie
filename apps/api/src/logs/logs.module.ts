import { Module } from "@nestjs/common";
import { LogsService } from "./logs.service";
import { LogsController } from "./logs.controller";
import { LogsGateway } from "./logs.gateway";

@Module({
  providers: [LogsService, LogsGateway],
  controllers: [LogsController],
  exports: [LogsService],
})
export class LogsModule {}

import { Module } from "@nestjs/common";
import { ConfirmService } from "./confirm.service";
import { JsonlWriterService } from "./jsonl-writer.service";
import { LoggerService } from "./logger.service";
import { StreamRendererService } from "./stream-renderer.service";
import { createLoggerProvider } from "./logger.decorator";

const rootLoggerProvider = createLoggerProvider();

@Module({
  providers: [
    LoggerService,
    ConfirmService,
    JsonlWriterService,
    StreamRendererService,
    rootLoggerProvider,
  ],
  exports: [
    LoggerService,
    ConfirmService,
    JsonlWriterService,
    StreamRendererService,
    rootLoggerProvider,
  ],
})
export class IoModule {}

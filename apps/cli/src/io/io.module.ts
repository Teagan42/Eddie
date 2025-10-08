import { Module } from "@nestjs/common";
import { ConfirmService } from "./confirm.service";
import { JsonlWriterService } from "./jsonl-writer.service";
import { LoggerService } from "./logger.service";
import { StreamRendererService } from "./stream-renderer.service";

@Module({
  providers: [LoggerService, ConfirmService, JsonlWriterService, StreamRendererService],
  exports: [LoggerService, ConfirmService, JsonlWriterService, StreamRendererService],
})
export class IoModule {}

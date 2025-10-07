import { Module } from "@nestjs/common";
import { ConfirmService } from "./confirm";
import { JsonlWriterService } from "./jsonl_writer";
import { LoggerService } from "./logger";
import { StreamRendererService } from "./stream_renderer";

@Module({
  providers: [LoggerService, ConfirmService, JsonlWriterService, StreamRendererService],
  exports: [LoggerService, ConfirmService, JsonlWriterService, StreamRendererService],
})
export class IoModule {}

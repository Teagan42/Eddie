import { Module } from "@nestjs/common";
import type { Provider } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { ConfirmService } from "./confirm.service";
import { JsonlWriterService } from "./jsonl-writer.service";
import { LoggerService } from "./logger.service";
import { StreamRendererService } from "./stream-renderer.service";
import { createLoggerProvider } from "./logger.decorator";
import { AgentStreamEventHandler } from "./agent-stream-event.handler";

const rootLoggerProvider = createLoggerProvider();

const providers: Provider[] = [
  LoggerService,
  ConfirmService,
  JsonlWriterService,
  StreamRendererService,
  rootLoggerProvider,
  AgentStreamEventHandler,
];

const exportsList = providers.filter(
  (provider) => provider !== rootLoggerProvider
);

@Module({
  imports: [CqrsModule],
  providers,
  exports: exportsList,
})
export class IoModule {}

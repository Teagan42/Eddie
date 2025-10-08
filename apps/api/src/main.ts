import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { ApiModule } from "./api.module";
import { initTracing } from "./telemetry/tracing";
import { HttpLoggerMiddleware } from "./middleware/http-logger.middleware";
import { ConfigService } from "../../cli/src/config/config.service";
import type {
  CliRuntimeOptions,
  EddieConfig,
} from "../../cli/src/config/types";
import { LoggerService } from "../../cli/src/io/logger.service";

async function configureLogging(
  configService: ConfigService,
  loggerService: LoggerService
): Promise<void> {
  const runtimeOptions: CliRuntimeOptions = {};
  const config: EddieConfig = await configService.load(runtimeOptions);
  loggerService.configure({
    level: config.logging?.level ?? config.logLevel,
    destination: config.logging?.destination,
    enableTimestamps: config.logging?.enableTimestamps,
  });
}

async function bootstrap(): Promise<void> {
  await initTracing();

  const app = await NestFactory.create(ApiModule, { bufferLogs: true });
  app.enableShutdownHooks();
  app.useWebSocketAdapter(new IoAdapter(app));

  const configService = app.get(ConfigService);
  const loggerService = app.get(LoggerService);
  await configureLogging(configService, loggerService);
  app.flushLogs();

  const httpLogger = app.get(HttpLoggerMiddleware);
  app.use(httpLogger.use.bind(httpLogger));

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen(port, host);
}

void bootstrap();

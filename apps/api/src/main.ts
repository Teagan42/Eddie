import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WsAdapter } from "@nestjs/platform-ws";
import { ApiModule } from "./api.module";
import { initTracing } from "./telemetry/tracing";
import { HttpLoggerMiddleware } from "./middleware/http-logger.middleware";
import { ConfigService } from "@eddie/config";
import type { CliRuntimeOptions, EddieConfig } from "@eddie/config";
import { LoggerService } from "@eddie/io";
import { applyCorsConfig } from "./cors";

function configureLogging(
  config: EddieConfig,
  loggerService: LoggerService
): void {
  loggerService.configure({
    level: config.logging?.level ?? config.logLevel,
    destination: config.logging?.destination,
    enableTimestamps: config.logging?.enableTimestamps,
  });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ApiModule, { bufferLogs: true });
  app.enableShutdownHooks();
  app.useWebSocketAdapter(new WsAdapter(app));

  const configService = app.get(ConfigService);
  const loggerService = app.get(LoggerService);
  const runtimeOptions: CliRuntimeOptions = {};
  const config: EddieConfig = await configService.load(runtimeOptions);

  if (config.api?.telemetry?.enabled) {
    await initTracing({
      consoleExporter: config.api.telemetry.consoleExporter,
    });
  }

  configureLogging(config, loggerService);
  applyCorsConfig(app, config);
  app.flushLogs();

  const httpLogger = app.get(HttpLoggerMiddleware);
  app.use(httpLogger.use.bind(httpLogger));

  const envPort =
    typeof process.env.PORT !== "undefined"
      ? Number(process.env.PORT)
      : undefined;
  const port =
    config.api?.port ??
    (typeof envPort === "number" && !Number.isNaN(envPort) ? envPort : 3000);
  const host = config.api?.host ?? process.env.HOST ?? "0.0.0.0";
  await app.listen(port, host);
}

void bootstrap();

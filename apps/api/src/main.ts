import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WsAdapter } from "@nestjs/platform-ws";
import { ApiModule } from "./api.module";
import { initTracing } from "./telemetry/tracing";
import { HttpLoggerMiddleware } from "./middleware/http-logger.middleware";
import {
  ConfigStore,
  mergeCliRuntimeOptions,
  parseCliRuntimeOptionsFromArgv,
  resolveCliRuntimeOptionsFromEnv,
} from "@eddie/config";
import type { CliRuntimeOptions, EddieConfig } from "@eddie/types";
import { LoggerService } from "@eddie/io";
import { applyCorsConfig } from "./cors";
import { ensureDefaultConfigRoot } from "./config-root";
import { configureOpenApi } from "./openapi-config";
import {
  getRuntimeOptions,
  setRuntimeOptions,
} from "./runtime-options";

function resolveRuntimeOverrides(): CliRuntimeOptions {
  const envRuntimeOptions = resolveCliRuntimeOptionsFromEnv(process.env);
  const cliRuntimeOptions = parseCliRuntimeOptionsFromArgv(process.argv.slice(2));
  return mergeCliRuntimeOptions(envRuntimeOptions, cliRuntimeOptions);
}

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

export async function bootstrap(): Promise<void> {
  ensureDefaultConfigRoot();

  const overrides = resolveRuntimeOverrides();
  setRuntimeOptions(overrides);
  const runtimeOptions = getRuntimeOptions();

  const app = await NestFactory.create(
    ApiModule.forRoot(runtimeOptions),
    { bufferLogs: true },
  );
  app.enableShutdownHooks();
  app.useWebSocketAdapter(new WsAdapter(app));

  const configStore = app.get(ConfigStore);
  const loggerService = app.get(LoggerService);
  const config: EddieConfig = configStore.getSnapshot();

  if (config.api?.telemetry?.enabled) {
    await initTracing({
      consoleExporter: config.api.telemetry.consoleExporter,
    });
  }

  configureLogging(config, loggerService);
  applyCorsConfig(app, config);
  app.flushLogs();

  await configureOpenApi(app);

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

// function isRunningAsStandaloneProcess(): boolean {
//   const entry = process.argv[ 1 ];
//   if (!entry) {
//     return false;
//   }

//   const normalized = entry.replace(/\\/g, "/");
//   return (
//     normalized.includes("/apps/api/") && /\/main\.(js|ts)$/.test(normalized)
//   );
// }

// if (isRunningAsStandaloneProcess()) {
//   setRuntimeOptionsFromArgv(process.argv.slice(2));
void bootstrap();
// }

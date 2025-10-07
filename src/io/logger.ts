import fs from "fs";
import path from "path";
import pino, { type Logger, type LoggerOptions } from "pino";
import type { LoggingConfig, LoggingDestination } from "../config/types";

let rootLogger: Logger | null = null;
let cachedSignature = "";

function computeSignature(config?: LoggingConfig): string {
  return JSON.stringify(config ?? {});
}

function resolvePrettyTransport(destination?: LoggingDestination): LoggerOptions["transport"] {
  const wantsPretty = destination?.pretty ?? (destination?.type !== "file" && process.stdout.isTTY);
  if (!wantsPretty) return undefined;

  try {
    require.resolve("pino-pretty");
    return {
      target: "pino-pretty",
      options: {
        colorize: destination?.colorize ?? true,
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
      },
    };
  } catch {
    return undefined;
  }
}

function prepareDestination(destination?: LoggingDestination) {
  if (!destination) return undefined;

  switch (destination.type) {
    case "stdout":
      return pino.destination({ fd: 1 });
    case "stderr":
      return pino.destination({ fd: 2 });
    case "file": {
      const filePath = path.resolve(destination.path ?? ".eddie/logs/eddie.log");
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      return pino.destination({ dest: filePath, sync: false });
    }
    default:
      return undefined;
  }
}

function buildLogger(config?: LoggingConfig): Logger {
  const level = config?.level ?? "info";
  const destination = config?.destination;
  const options: LoggerOptions = {
    level: level === "silent" ? "silent" : level,
    base: undefined,
    timestamp: config?.enableTimestamps === false ? false : pino.stdTimeFunctions.isoTime,
  };

  const transport = resolvePrettyTransport(destination);
  if (transport) {
    options.transport = transport;
  }

  const destStream = transport ? undefined : prepareDestination(destination);
  return destStream ? pino(options, destStream) : pino(options);
}

export function initLogging(config?: LoggingConfig): Logger {
  const signature = computeSignature(config);
  if (rootLogger && signature === cachedSignature) {
    return rootLogger;
  }
  rootLogger = buildLogger(config);
  cachedSignature = signature;
  return rootLogger;
}

export function getLogger(scope?: string): Logger {
  if (!rootLogger) {
    rootLogger = buildLogger();
  }
  if (!scope) {
    return rootLogger;
  }
  return rootLogger.child({ scope });
}

export function withBindings(bindings: Record<string, unknown>): Logger {
  return getLogger().child(bindings);
}

export function resetLogging(): void {
  rootLogger = null;
  cachedSignature = "";
}

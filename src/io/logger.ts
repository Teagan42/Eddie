import { Injectable } from "@nestjs/common";
import fs from "fs";
import path from "path";
import pino, { type Logger, type LoggerOptions } from "pino";
import type { LoggingConfig, LoggingDestination } from "../config/types";

@Injectable()
export class LoggerService {
  private rootLogger: Logger | null = null;
  private cachedSignature = "";

  configure(config?: LoggingConfig): Logger {
    const signature = this.computeSignature(config);
    if (this.rootLogger && signature === this.cachedSignature) {
      return this.rootLogger;
    }
    this.rootLogger = this.buildLogger(config);
    this.cachedSignature = signature;
    return this.rootLogger;
  }

  getLogger(scope?: string): Logger {
    if (!this.rootLogger) {
      this.rootLogger = this.buildLogger();
    }
    if (!scope) {
      return this.rootLogger;
    }
    return this.rootLogger.child({ scope });
  }

  withBindings(bindings: Record<string, unknown>): Logger {
    return this.getLogger().child(bindings);
  }

  reset(): void {
    this.rootLogger = null;
    this.cachedSignature = "";
  }

  private computeSignature(config?: LoggingConfig): string {
    return JSON.stringify(config ?? {});
  }

  private resolvePrettyTransport(
    destination?: LoggingDestination
  ): LoggerOptions["transport"] {
    const wantsPretty =
      destination?.pretty ?? (destination?.type !== "file" && process.stdout.isTTY);
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

  private prepareDestination(destination?: LoggingDestination) {
    if (!destination) return undefined;

    switch (destination.type) {
      case "stdout":
        return pino.destination({ fd: 1 });
      case "stderr":
        return pino.destination({ fd: 2 });
      case "file": {
        const filePath = path.resolve(
          destination.path ?? ".eddie/logs/eddie.log"
        );
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        return pino.destination({ dest: filePath, sync: false });
      }
      default:
        return undefined;
    }
  }

  private buildLogger(config?: LoggingConfig): Logger {
    const level = config?.level ?? "info";
    const destination = config?.destination;
    const options: LoggerOptions = {
      level: level === "silent" ? "silent" : level,
      base: undefined,
      timestamp:
        config?.enableTimestamps === false
          ? false
          : pino.stdTimeFunctions.isoTime,
    };

    const transport = this.resolvePrettyTransport(destination);
    if (transport) {
      options.transport = transport;
    }

    const destStream = transport ? undefined : this.prepareDestination(destination);
    return destStream ? pino(options, destStream) : pino(options);
  }
}

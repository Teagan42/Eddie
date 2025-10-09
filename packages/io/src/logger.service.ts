import { Injectable } from "@nestjs/common";
import fs from "fs";
import path from "path";
import pino, { type Logger, type LoggerOptions } from "pino";
import type { LoggingConfig, LoggingDestination } from "@eddie/config";

type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

export interface LoggerEvent {
  level: LogLevel;
  args: unknown[];
}

export type LoggerListener = (event: LoggerEvent) => void;

@Injectable()
export class LoggerService {
  private rootLogger: Logger | null = null;
  private rawLogger: Logger | null = null;
  private cachedSignature = "";
  private readonly listeners = new Set<LoggerListener>();
  private readonly logLevels: LogLevel[] = [
    "fatal",
    "error",
    "warn",
    "info",
    "debug",
    "trace",
  ];

  registerListener(listener: LoggerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  configure(config?: LoggingConfig): Logger {
    const signature = this.computeSignature(config);
    if (this.rootLogger && signature === this.cachedSignature) {
      return this.rootLogger;
    }
    const rawLogger = this.buildLogger(config);
    this.rawLogger = rawLogger;
    this.rootLogger = this.wrapLogger(rawLogger);
    this.cachedSignature = signature;
    return this.rootLogger;
  }

  getLogger(scope?: string): Logger {
    if (!this.rootLogger) {
      const rawLogger = this.buildLogger();
      this.rawLogger = rawLogger;
      this.rootLogger = this.wrapLogger(rawLogger);
    }
    if (!scope) {
      return this.rootLogger;
    }
    const base = this.rawLogger ?? this.rootLogger;
    const child = base.child({ scope });
    return this.wrapLogger(child);
  }

  withBindings(bindings: Record<string, unknown>): Logger {
    return this.getLogger().child(bindings);
  }

  reset(): void {
    this.rootLogger = null;
    this.rawLogger = null;
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
    const logger = destStream ? pino(options, destStream) : pino(options);
    return logger;
  }

  private wrapLogger(logger: Logger): Logger {
    const service = this;

    if ((logger as unknown as { __eddieWrapped?: boolean }).__eddieWrapped) {
      return logger;
    }

    const proxy = new Proxy(logger, {
      get(target, property, receiver) {
        if (property === "__eddieWrapped") {
          return true;
        }

        if (property === "child") {
          return (...args: Parameters<Logger["child"]>) => {
            const next = target.child(...args);
            return service.wrapLogger(next);
          };
        }

        if (
          typeof property === "string" &&
          (service.logLevels as readonly string[]).includes(property)
        ) {
          const original = Reflect.get(target, property, receiver);
          if (typeof original !== "function") {
            return original;
          }

          return (...args: unknown[]) => {
            service.notify(property as LogLevel, args);
            return original.apply(target, args);
          };
        }

        return Reflect.get(target, property, receiver);
      },
    });

    return proxy as Logger;
  }

  private notify(level: LogLevel, args: unknown[]): void {
    if (this.listeners.size === 0) {
      return;
    }

    const event: LoggerEvent = { level, args };
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

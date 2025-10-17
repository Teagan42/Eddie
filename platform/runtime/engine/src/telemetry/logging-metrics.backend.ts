import { Logger } from "@nestjs/common";

import type { MetricsBackend } from "./metrics.service";

export type LoggingMetricsBackendLevel = "debug" | "log" | "verbose";

type LoggerLike = Pick<Logger, LoggingMetricsBackendLevel>;

export interface LoggingMetricsBackendOptions {
  logger?: LoggerLike;
  level?: LoggingMetricsBackendLevel;
  context?: string;
}

export class LoggingMetricsBackend implements MetricsBackend {
  private readonly logger: LoggerLike;
  private readonly level: LoggingMetricsBackendLevel;
  private readonly context: string;

  constructor(options: LoggingMetricsBackendOptions = {}) {
    this.context = options.context ?? LoggingMetricsBackend.name;
    this.logger = options.logger ?? new Logger(this.context);
    this.level = options.level ?? "debug";
  }

  incrementCounter(
    metric: string,
    value = 1,
    labels?: Record<string, string>
  ): void {
    this.log("counter.increment", metric, value, labels);
  }

  recordHistogram(
    metric: string,
    value: number,
    labels?: Record<string, string>
  ): void {
    this.log("histogram.record", metric, value, labels);
  }

  private log(
    event: "counter.increment" | "histogram.record",
    metric: string,
    value: number,
    labels?: Record<string, string>
  ): void {
    const payload = {
      event,
      metric,
      value,
      labels: labels ?? {},
    };

    const loggerMethod = this.logger[this.level] ?? this.logger.log;
    if (typeof loggerMethod !== "function") {
      return;
    }

    loggerMethod.call(this.logger, payload, this.context);
  }
}

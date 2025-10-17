import { Injectable } from "@nestjs/common";
import type { CliRuntimeOptions } from "@eddie/config";
import type { EngineOptions } from "@eddie/engine";

function toStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return undefined;
}

function assignStringOption<Key extends keyof CliRuntimeOptions>(
  target: CliRuntimeOptions,
  options: Record<string, unknown>,
  key: Key,
): void {
  const value = options[key];
  if (typeof value === "string") {
    target[key] = value as CliRuntimeOptions[Key];
  }
}

@Injectable()
export class CliOptionsService {
  parse(options: Record<string, unknown>): EngineOptions {
    const base: CliRuntimeOptions = {};

    const context = toStringArray(options.context);
    if (context) base.context = context;

    assignStringOption(base, options, "config");
    assignStringOption(base, options, "preset");
    assignStringOption(base, options, "model");
    assignStringOption(base, options, "provider");
    assignStringOption(base, options, "jsonlTrace");
    if (typeof options.logLevel === "string") {
      base.logLevel = options.logLevel as CliRuntimeOptions["logLevel"];
    }
    assignStringOption(base, options, "logFile");
    assignStringOption(base, options, "agentMode");
    if (typeof options.metricsBackend === "string") {
      const backend = options.metricsBackend;
      if (backend === "logging" || backend === "noop") {
        base.metricsBackend = backend;
      }
    }
    if (typeof options.metricsLoggingLevel === "string") {
      const level = options.metricsLoggingLevel;
      if (level === "debug" || level === "log" || level === "verbose") {
        base.metricsLoggingLevel = level as CliRuntimeOptions["metricsLoggingLevel"];
      }
    }
    if (typeof options.disableSubagents === "boolean") {
      base.disableSubagents = options.disableSubagents;
    }
    if (options.disableContext === true || options.noContext === true) {
      base.disableContext = true;
    }

    const autoApprove =
      typeof options.autoApprove === "boolean"
        ? options.autoApprove
        : typeof options.auto === "boolean"
          ? options.auto
          : undefined;

    const nonInteractive =
      typeof options.nonInteractive === "boolean"
        ? options.nonInteractive
        : undefined;

    const tools = toStringArray(options.tools);
    const disabledTools = toStringArray(
      options.disabledTools ?? options.disableTools,
    );

    return {
      ...base,
      autoApprove,
      nonInteractive,
      tools,
      disabledTools,
    };
  }
}

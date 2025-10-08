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

@Injectable()
export class CliOptionsService {
  parse(options: Record<string, unknown>): EngineOptions {
    const base: CliRuntimeOptions = {};

    const context = toStringArray(options.context);
    if (context) base.context = context;

    if (typeof options.config === "string") base.config = options.config;
    if (typeof options.model === "string") base.model = options.model;
    if (typeof options.provider === "string") base.provider = options.provider;
    if (typeof options.jsonlTrace === "string") {
      base.jsonlTrace = options.jsonlTrace;
    }
    if (typeof options.logLevel === "string") {
      base.logLevel = options.logLevel as CliRuntimeOptions["logLevel"];
    }
    if (typeof options.logFile === "string") {
      base.logFile = options.logFile;
    }
    if (typeof options.agentMode === "string") {
      base.agentMode = options.agentMode;
    }
    if (typeof options.disableSubagents === "boolean") {
      base.disableSubagents = options.disableSubagents;
    }
    if (options.noContext === true) {
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
    const disabledTools = toStringArray(options.disableTools);

    return {
      ...base,
      autoApprove,
      nonInteractive,
      tools,
      disabledTools,
    };
  }
}

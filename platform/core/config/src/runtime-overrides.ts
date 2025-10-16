import type { CliRuntimeOptions } from "./types";

export function hasRuntimeOverrides(options: CliRuntimeOptions): boolean {
  if (options.context?.length) {
    return true;
  }

  if ((options.tools?.length ?? 0) > 0 || (options.disabledTools?.length ?? 0) > 0) {
    return true;
  }

  if (typeof options.disableContext === "boolean") {
    return true;
  }

  if (typeof options.autoApprove === "boolean") {
    return true;
  }

  if (typeof options.disableSubagents === "boolean") {
    return true;
  }

  const stringOverrides = [
    options.config,
    options.model,
    options.provider,
    options.jsonlTrace,
    options.logLevel,
    options.logFile,
    options.agentMode,
  ];

  return stringOverrides.some(
    (value) => typeof value !== "undefined" && value !== null && String(value).length > 0
  );
}

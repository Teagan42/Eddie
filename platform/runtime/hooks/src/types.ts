import {
  HookBlockResponse,
  HookStopEnqueueResponse,
  SpawnSubagentOverride,
} from '@eddie/types';

export function isSpawnSubagentOverride(
  value: unknown
): value is SpawnSubagentOverride {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    Object.prototype.hasOwnProperty.call(candidate, "prompt") ||
    Object.prototype.hasOwnProperty.call(candidate, "variables") ||
    Object.prototype.hasOwnProperty.call(candidate, "context") ||
    Object.prototype.hasOwnProperty.call(candidate, "allowedSubagents")
  );
}

export function blockHook(reason?: string): HookBlockResponse {
  return { blocked: true, reason };
}

export function isHookBlockResponse(value: unknown): value is HookBlockResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "blocked" in value &&
    (value as Record<string, unknown>).blocked === true
  );
}

export function isHookStopEnqueueResponse(
  value: unknown
): value is HookStopEnqueueResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.continue !== true) {
    return false;
  }

  if (!Array.isArray(candidate.enqueue)) {
    return false;
  }

  return candidate.enqueue.every((message) => {
    if (typeof message !== "object" || message === null) {
      return false;
    }

    const record = message as Record<string, unknown>;
    return typeof record.role === "string" && typeof record.content === "string";
  });
}

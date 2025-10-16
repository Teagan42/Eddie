import { HookBlockResponse, SpawnSubagentOverride } from '@eddie/types';

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
    Object.prototype.hasOwnProperty.call(candidate, "context")
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

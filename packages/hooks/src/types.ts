import {
  HOOK_EVENTS,
} from "@eddie/types";
import type {
  AgentCompletionPayload,
  AgentContextSummary,
  AgentErrorPayload,
  AgentIterationPayload,
  AgentLifecyclePayload,
  AgentMetadata,
  AgentNotificationPayload,
  AgentStreamErrorPayload,
  AgentToolCallPayload,
  AgentToolResultPayload,
  AgentTranscriptCompactionPayload,
  HookAgentRunOptions,
  HookAgentRunResult,
  HookAgentRunner,
  HookBlockResponse,
  HookDispatchResult,
  HookEventMap,
  HookEventName,
  HookListener,
  HookListenerResult,
  SessionEndPayload,
  SessionMetadata,
  SessionStartPayload,
  SessionStatus,
  SpawnSubagentDelegateOptions,
  SpawnSubagentDelegateResult,
  SpawnSubagentHookPayload,
  SpawnSubagentOverride,
  SpawnSubagentRequest,
  SpawnSubagentTargetMetadata,
  SpawnSubagentTargetSummary,
  UserPromptSubmitPayload,
} from "@eddie/types";

export { HOOK_EVENTS };
export type {
  AgentCompletionPayload,
  AgentContextSummary,
  AgentErrorPayload,
  AgentIterationPayload,
  AgentLifecyclePayload,
  AgentMetadata,
  AgentNotificationPayload,
  AgentStreamErrorPayload,
  AgentToolCallPayload,
  AgentToolResultPayload,
  AgentTranscriptCompactionPayload,
  HookAgentRunOptions,
  HookAgentRunResult,
  HookAgentRunner,
  HookBlockResponse,
  HookDispatchResult,
  HookEventMap,
  HookEventName,
  HookListener,
  HookListenerResult,
  SessionEndPayload,
  SessionMetadata,
  SessionStartPayload,
  SessionStatus,
  SpawnSubagentDelegateOptions,
  SpawnSubagentDelegateResult,
  SpawnSubagentHookPayload,
  SpawnSubagentOverride,
  SpawnSubagentRequest,
  SpawnSubagentTargetMetadata,
  SpawnSubagentTargetSummary,
  UserPromptSubmitPayload,
};

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

import type {
  ChatMessage,
  PackedContext,
  StreamEvent,
  ToolResult,
} from "@eddie/types";
import type { TemplateVariables } from "@eddie/templates";
import type { CliRuntimeOptions, EddieConfig } from "@eddie/config";

/**
 * Ordered hook event names emitted during an engine run so authors can trace
 * the lifecycle flow quickly:
 * 1. `sessionStart`
 * 2. `beforeContextPack`
 * 3. `afterContextPack`
 * 4. `userPromptSubmit`
 * 5. `beforeAgentStart`
 * 6. `preCompact` (per iteration, when transcript compaction is planned)
 * 7. `beforeModelCall` (per iteration)
 * 8. `preToolUse` → `beforeSpawnSubagent` (per `spawn_subagent` call) → `postToolUse`
 * 9. `notification` (streamed provider notices)
 * 10. `onError` (provider stream errors) and `onAgentError` (tool/model failures)
 * 11. `stop` (per iteration completion)
 * 12. `afterAgentComplete`
 * 13. `subagentStop` (after non-root agents finish)
 * 14. `sessionEnd`
 */
export const HOOK_EVENTS = {
  beforeContextPack: "beforeContextPack",
  afterContextPack: "afterContextPack",
  sessionStart: "sessionStart",
  userPromptSubmit: "userPromptSubmit",
  sessionEnd: "sessionEnd",
  beforeAgentStart: "beforeAgentStart",
  afterAgentComplete: "afterAgentComplete",
  onAgentError: "onAgentError",
  beforeModelCall: "beforeModelCall",
  preCompact: "preCompact",
  preToolUse: "preToolUse",
  beforeSpawnSubagent: "beforeSpawnSubagent",
  postToolUse: "postToolUse",
  notification: "notification",
  onError: "onError",
  stop: "stop",
  subagentStop: "subagentStop",
} as const;

export type HookEventName = (typeof HOOK_EVENTS)[keyof typeof HOOK_EVENTS];

export interface SessionMetadata {
  id: string;
  startedAt: string;
  prompt: string;
  provider: string;
  model: string;
  tracePath?: string;
}

export type SessionStatus = "success" | "error";

/**
 * Payload delivered to {@link HOOK_EVENTS.sessionStart}, emitted immediately
 * after configuration is resolved but before any work begins.
 * @property metadata - Identifiers and metadata describing the session.
 * @property config - The fully merged Eddie configuration for the run.
 * @property options - CLI/runtime overrides that were supplied by the user.
 */
export interface SessionStartPayload {
  metadata: SessionMetadata;
  config: EddieConfig;
  options: CliRuntimeOptions;
}

/**
 * Payload delivered to {@link HOOK_EVENTS.sessionEnd}, emitted once the engine
 * finishes or fails.
 * @property metadata - Identifiers and metadata describing the session.
 * @property status - Indicates whether execution succeeded or failed.
 * @property durationMs - Total runtime in milliseconds.
 * @property result - Summary statistics when the session succeeds.
 * @property error - Serialized failure information when execution errors.
 */
export interface SessionEndPayload {
  metadata: SessionMetadata;
  status: SessionStatus;
  durationMs: number;
  result?: {
    messageCount: number;
    agentCount: number;
    contextBytes: number;
  };
  error?: { message: string; stack?: string; cause?: unknown };
}

/**
 * Payload for {@link HOOK_EVENTS.userPromptSubmit}, emitted just before the
 * root agent begins processing the user's prompt.
 * @property metadata - Session metadata for correlating downstream work.
 * @property prompt - The raw user prompt being submitted to the agent.
 * @property historyLength - Number of conversation turns provided as history.
 * @property options - CLI/runtime overrides active for this execution.
 */
export interface UserPromptSubmitPayload {
  metadata: SessionMetadata;
  prompt: string;
  historyLength: number;
  options: CliRuntimeOptions;
}

export interface AgentMetadata {
  id: string;
  parentId?: string;
  depth: number;
  isRoot: boolean;
  systemPrompt: string;
  tools: string[];
  model?: string;
  provider?: string;
}

export interface AgentContextSummary {
  totalBytes: number;
  fileCount: number;
}

/**
 * Shared base payload for agent lifecycle hooks such as
 * {@link HOOK_EVENTS.beforeAgentStart}, {@link HOOK_EVENTS.afterAgentComplete},
 * and {@link HOOK_EVENTS.subagentStop}.
 * @property metadata - Identity and structure for the running agent.
 * @property prompt - The user prompt the agent is attempting to satisfy.
 * @property context - Summary of the packed context the agent received.
 * @property historyLength - Count of prior conversation turns.
 */
export interface AgentLifecyclePayload {
  metadata: AgentMetadata;
  prompt: string;
  context: AgentContextSummary;
  historyLength: number;
}

/**
 * Payload for {@link HOOK_EVENTS.beforeModelCall} and
 * {@link HOOK_EVENTS.stop}, describing an agent iteration.
 * @property metadata - Identity and structure for the running agent.
 * @property prompt - The user prompt the agent is attempting to satisfy.
 * @property context - Summary of the packed context the agent received.
 * @property historyLength - Count of prior conversation turns.
 * @property iteration - Sequential iteration counter starting at one.
 * @property messages - Full conversation transcript for the agent so far.
 */
export interface AgentIterationPayload extends AgentLifecyclePayload {
  iteration: number;
  messages: ChatMessage[];
}

/**
 * Payload for {@link HOOK_EVENTS.preCompact}, emitted before applying a
 * transcript compaction plan.
 * @property metadata - Identity and structure for the running agent.
 * @property prompt - The user prompt the agent is attempting to satisfy.
 * @property context - Summary of the packed context the agent received.
 * @property historyLength - Count of prior conversation turns.
 * @property iteration - Sequential iteration counter starting at one.
 * @property messages - Transcript available before compaction occurs.
 * @property reason - Optional explanation provided by the compactor.
 */
export interface AgentTranscriptCompactionPayload extends AgentIterationPayload {
  reason?: string;
}

/**
 * Payload for {@link HOOK_EVENTS.afterAgentComplete}, emitted after an agent
 * successfully concludes.
 * @property metadata - Identity and structure for the running agent.
 * @property prompt - The user prompt the agent is attempting to satisfy.
 * @property context - Summary of the packed context the agent received.
 * @property historyLength - Count of prior conversation turns.
 * @property messages - Final conversation transcript for the agent.
 * @property iterations - Number of iterations the agent executed.
 */
export interface AgentCompletionPayload extends AgentLifecyclePayload {
  messages: ChatMessage[];
  iterations: number;
}

/**
 * Payload for {@link HOOK_EVENTS.preToolUse}, emitted when the model requests a
 * tool execution but before it is invoked.
 * @property metadata - Identity and structure for the running agent.
 * @property prompt - The user prompt the agent is attempting to satisfy.
 * @property context - Summary of the packed context the agent received.
 * @property historyLength - Count of prior conversation turns.
 * @property iteration - Sequential iteration counter starting at one.
 * @property event - The raw tool call emitted by the provider stream.
 */
export interface AgentToolCallPayload extends AgentLifecyclePayload {
  iteration: number;
  event: Extract<StreamEvent, { type: "tool_call" }>;
}

/**
 * Payload for {@link HOOK_EVENTS.postToolUse}, emitted after a tool call
 * completes successfully.
 * @property metadata - Identity and structure for the running agent.
 * @property prompt - The user prompt the agent is attempting to satisfy.
 * @property context - Summary of the packed context the agent received.
 * @property historyLength - Count of prior conversation turns.
 * @property iteration - Sequential iteration counter starting at one.
 * @property event - The originating tool call request from the provider.
 * @property result - Tool output returned to the agent.
 */
export interface AgentToolResultPayload extends AgentLifecyclePayload {
  iteration: number;
  event: Extract<StreamEvent, { type: "tool_call" }>;
  result: ToolResult;
}

export interface SpawnSubagentTargetMetadata {
  name?: string;
  description?: string;
  routingThreshold?: number;
  profileId?: string;
}

export interface SpawnSubagentTargetSummary {
  id: string;
  model: string;
  provider: string;
  metadata?: SpawnSubagentTargetMetadata;
}

export interface SpawnSubagentRequest {
  agentId: string;
  prompt: string;
  variables?: TemplateVariables;
  context?: PackedContext;
  metadata?: Record<string, unknown>;
}

export interface SpawnSubagentDelegateOptions {
  agentId: string;
  prompt: string;
  variables?: TemplateVariables;
  context?: PackedContext;
}

export interface SpawnSubagentDelegateResult {
  prompt: string;
  messages: ChatMessage[];
  target: SpawnSubagentTargetSummary;
}

/**
 * Options used when a hook triggers an auxiliary agent run through the shared
 * {@link HookBus}. Mirrors {@link SpawnSubagentDelegateOptions} so hooks can
 * reuse the same payload structure when delegating or performing out-of-band
 * evaluations.
 */
export type HookAgentRunOptions = SpawnSubagentDelegateOptions;

/**
 * Result returned from {@link HookBus.runAgent}, exposing the spawned
 * transcript and target summary for downstream policy checks.
 */
export type HookAgentRunResult = SpawnSubagentDelegateResult;

export type HookAgentRunner = (
  options: HookAgentRunOptions
) => Promise<HookAgentRunResult>;

export interface SpawnSubagentOverride {
  prompt?: string;
  variables?: TemplateVariables;
  context?: PackedContext;
}

export interface SpawnSubagentHookPayload extends AgentLifecyclePayload {
  event: Extract<StreamEvent, { type: "tool_call" }>;
  request: SpawnSubagentRequest;
  target: SpawnSubagentTargetSummary;
  spawn: (
    options: SpawnSubagentDelegateOptions
  ) => Promise<SpawnSubagentDelegateResult>;
}

/**
 * Payload for {@link HOOK_EVENTS.onError}, emitted when the provider stream
 * surfaces an error during an iteration.
 * @property metadata - Identity and structure for the running agent.
 * @property prompt - The user prompt the agent is attempting to satisfy.
 * @property context - Summary of the packed context the agent received.
 * @property historyLength - Count of prior conversation turns.
 * @property iteration - Sequential iteration counter starting at one.
 * @property error - The raw stream error from the provider.
 */
export interface AgentStreamErrorPayload extends AgentLifecyclePayload {
  iteration: number;
  error: Extract<StreamEvent, { type: "error" }>;
}

/**
 * Payload for {@link HOOK_EVENTS.onAgentError}, emitted when a tool or model
 * failure is detected and the agent cannot proceed.
 * @property metadata - Identity and structure for the running agent.
 * @property prompt - The user prompt the agent is attempting to satisfy.
 * @property context - Summary of the packed context the agent received.
 * @property historyLength - Count of prior conversation turns.
 * @property error - Serialized error describing the failure.
 */
export interface AgentErrorPayload extends AgentLifecyclePayload {
  error: { message: string; stack?: string; cause?: unknown };
}

/**
 * Payload for {@link HOOK_EVENTS.notification}, emitted for auxiliary provider
 * messages such as system notices or warnings.
 * @property metadata - Identity and structure for the running agent.
 * @property prompt - The user prompt the agent is attempting to satisfy.
 * @property context - Summary of the packed context the agent received.
 * @property historyLength - Count of prior conversation turns.
 * @property iteration - Sequential iteration counter starting at one.
 * @property event - The notification event from the provider stream.
 */
export interface AgentNotificationPayload extends AgentLifecyclePayload {
  iteration: number;
  event: Extract<StreamEvent, { type: "notification" }>;
}

/**
 * Mapping between hook event identifiers and the payload shapes delivered for
 * each lifecycle stage. Refer to the summary above for the high-level order in
 * which these hooks fire.
 */
export type HookEventMap = {
  [HOOK_EVENTS.beforeContextPack]: {
    config: EddieConfig;
    options: CliRuntimeOptions;
  };
  [HOOK_EVENTS.afterContextPack]: { context: PackedContext };
  [HOOK_EVENTS.sessionStart]: SessionStartPayload;
  [HOOK_EVENTS.userPromptSubmit]: UserPromptSubmitPayload;
  [HOOK_EVENTS.sessionEnd]: SessionEndPayload;
  [HOOK_EVENTS.beforeAgentStart]: AgentLifecyclePayload;
  [HOOK_EVENTS.afterAgentComplete]: AgentCompletionPayload;
  [HOOK_EVENTS.onAgentError]: AgentErrorPayload;
  [HOOK_EVENTS.beforeModelCall]: AgentIterationPayload;
  [HOOK_EVENTS.preCompact]: AgentTranscriptCompactionPayload;
  [HOOK_EVENTS.preToolUse]: AgentToolCallPayload;
  [HOOK_EVENTS.beforeSpawnSubagent]: SpawnSubagentHookPayload;
  [HOOK_EVENTS.postToolUse]: AgentToolResultPayload;
  [HOOK_EVENTS.notification]: AgentNotificationPayload;
  [HOOK_EVENTS.onError]: AgentStreamErrorPayload;
  [HOOK_EVENTS.stop]: AgentIterationPayload;
  [HOOK_EVENTS.subagentStop]: AgentLifecyclePayload;
};

export type HookListener<K extends HookEventName> = (
  payload: HookEventMap[K]
) => unknown | Promise<unknown>;

export type HookListenerResult<K extends HookEventName> = Awaited<
  ReturnType<HookListener<K>>
>;

export interface HookBlockResponse {
  blocked: true;
  reason?: string;
}

export interface HookDispatchResult<K extends HookEventName> {
  results: HookListenerResult<K>[];
  blocked?: HookBlockResponse;
  error?: unknown;
}

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
    (value as HookBlockResponse).blocked === true
  );
}

export type HookEventHandlers = {
  [K in HookEventName]?: HookListener<K>;
};

export const hookEventNames = Object.values(HOOK_EVENTS) as HookEventName[];

export function isHookEventName(value: string): value is HookEventName {
  return (hookEventNames as readonly string[]).includes(value);
}

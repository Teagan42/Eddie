import { describe, expect, it, expectTypeOf } from "vitest";

import {
  CHAT_MESSAGE_REASONING_STATUSES,
  CHAT_MESSAGE_ROLES,
  CHAT_SESSION_STATUSES,
  TOOL_CALL_STATUSES,
  type ChatAgentMetadata,
  type ChatMessage,
  type ChatMessageMetadata,
  type ChatMessageReasoning,
  type ChatMessageReasoningSegment,
  type ChatMessageReasoningStatus,
  type ChatMessageRole,
  type ChatSession,
  type ChatSessionStatus,
  type ContextUpdateSourceType,
  type ExecutionAgentLineageMap,
  type ExecutionAgentNode,
  type ExecutionContextBundle,
  type ExecutionContextBundleFile,
  type ExecutionContextBundlesByAgentId,
  type ExecutionContextBundlesByToolCallId,
  type ExecutionToolInvocationGroupsByAgentId,
  type ExecutionToolInvocationNode,
  type ExecutionTreeState,
  type ToolCallStatus,
  isChatMessageReasoningStatus,
  isChatMessageRole,
  isChatSessionStatus,
  isContextUpdateSourceType,
  isToolCallStatus,
} from "../../src/chat";

describe("chat type contracts", () => {
  it("exposes chat session and message shapes", () => {
    expectTypeOf<ChatSession>().toMatchTypeOf<{
      id: string;
      title: string;
      status: ChatSessionStatus;
      description?: string | null;
      createdAt: string;
      updatedAt: string;
    }>();

    expectTypeOf<ChatSessionStatus>().toEqualTypeOf<"active" | "archived">();
    expect(CHAT_SESSION_STATUSES).toEqual(["active", "archived"]);
    expect(isChatSessionStatus("active")).toBe(true);
    expect(isChatSessionStatus("paused")).toBe(false);

    expectTypeOf<ChatMessageRole>().toEqualTypeOf<
      "user" | "assistant" | "system" | "tool"
    >();
    expectTypeOf<ChatMessage>().toMatchTypeOf<{
      id: string;
      sessionId: string;
      role: ChatMessageRole;
      content: string;
      createdAt: string;
      toolCallId?: string | null;
      name?: string | null;
      metadata?: ChatMessageMetadata | null;
      reasoning?: ChatMessageReasoning | null;
    }>();
    expect(CHAT_MESSAGE_ROLES).toEqual(["user", "assistant", "system", "tool"]);
    expect(isChatMessageRole("assistant")).toBe(true);
    expect(isChatMessageRole("moderator")).toBe(false);

    expectTypeOf<ChatAgentMetadata>().toMatchTypeOf<{
      id?: string | null;
      name?: string | null;
      parentId?: string | null;
      parentName?: string | null;
      lineage?: Array<
        | string
        | {
            id?: string | null;
            name?: string | null;
          }
      > | null;
    }>();

    expectTypeOf<ChatMessageMetadata>().toMatchTypeOf<
      | null
      | {
          agent?: ChatAgentMetadata | null;
          tool?: {
            id?: string | null;
            name?: string | null;
            status?: string | null;
          } | null;
        }
    >();

    expectTypeOf<ChatMessageReasoningStatus>().toEqualTypeOf<
      "streaming" | "completed"
    >();
    expect(CHAT_MESSAGE_REASONING_STATUSES).toEqual(["streaming", "completed"]);
    expect(isChatMessageReasoningStatus("completed")).toBe(true);
    expect(isChatMessageReasoningStatus("queued")).toBe(false);

    expectTypeOf<ChatMessageReasoningSegment>().toMatchTypeOf<{
      text?: string;
      metadata?: Record<string, unknown>;
      timestamp?: string;
      agentId?: string | null;
    }>();

    expectTypeOf<ChatMessageReasoning>().toMatchTypeOf<
      | null
      | {
          segments?: ChatMessageReasoningSegment[] | null;
          responseId?: string | null;
          status?: ChatMessageReasoningStatus | null;
        }
    >();
  });

  it("describes execution tree structures", () => {
    expectTypeOf<ToolCallStatus>().toEqualTypeOf<
      "pending" | "running" | "completed" | "failed"
    >();
    expect(TOOL_CALL_STATUSES).toEqual([
      "pending",
      "running",
      "completed",
      "failed",
    ]);
    expect(isToolCallStatus("running")).toBe(true);
    expect(isToolCallStatus("paused")).toBe(false);

    expectTypeOf<ContextUpdateSourceType>().toEqualTypeOf<
      "tool_call" | "tool_result" | "spawn_subagent"
    >();
    expect(isContextUpdateSourceType("tool_call")).toBe(true);
    expect(isContextUpdateSourceType("workflow_start")).toBe(false);

    expectTypeOf<ExecutionAgentNode>().toMatchTypeOf<{
      id: string;
      name: string;
      provider?: string | null;
      model?: string | null;
      depth: number;
      lineage: string[];
      children: ExecutionAgentNode[];
      metadata?: Record<string, unknown> | null;
    }>();

    expectTypeOf<ExecutionToolInvocationNode>().toMatchTypeOf<{
      id: string;
      agentId: string;
      name: string;
      status: ToolCallStatus;
      createdAt?: string;
      updatedAt?: string;
      metadata?: Record<string, unknown>;
      children: ExecutionToolInvocationNode[];
    }>();

    expectTypeOf<ExecutionContextBundleFile>().toMatchTypeOf<{
      path: string;
      sizeBytes: number;
      preview?: string | null;
    }>();

    expectTypeOf<ExecutionContextBundle>().toMatchTypeOf<{
      id: string;
      label: string;
      sizeBytes: number;
      fileCount: number;
      summary?: string | null;
      files?: ExecutionContextBundleFile[];
      metadata?: Record<string, unknown> | null;
      createdAt?: string;
      updatedAt?: string;
      source: {
        type: ContextUpdateSourceType;
        agentId: string;
        toolCallId: string;
      };
    }>();

    expectTypeOf<ExecutionAgentLineageMap>().toMatchTypeOf<Record<string, string[]>>();
    expectTypeOf<ExecutionContextBundlesByAgentId>().toMatchTypeOf<
      Record<string, ExecutionContextBundle[]>
    >();
    expectTypeOf<ExecutionContextBundlesByToolCallId>().toMatchTypeOf<
      Record<string, ExecutionContextBundle[]>
    >();
    expectTypeOf<ExecutionToolInvocationGroupsByAgentId>().toMatchTypeOf<
      Record<string, Record<ToolCallStatus, ExecutionToolInvocationNode[]>>
    >();

    expectTypeOf<ExecutionTreeState>().toMatchTypeOf<{
      agentHierarchy: ExecutionAgentNode[];
      toolInvocations: ExecutionToolInvocationNode[];
      contextBundles: ExecutionContextBundle[];
      agentLineageById: ExecutionAgentLineageMap;
      toolGroupsByAgentId: ExecutionToolInvocationGroupsByAgentId;
      contextBundlesByAgentId: ExecutionContextBundlesByAgentId;
      contextBundlesByToolCallId: ExecutionContextBundlesByToolCallId;
      createdAt: string;
      updatedAt: string;
    }>();
  });
});

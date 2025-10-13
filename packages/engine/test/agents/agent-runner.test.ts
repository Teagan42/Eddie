import { describe, expect, it, vi } from "vitest";
import type { PackedContext, StreamEvent, ToolResult, ToolSchema } from "@eddie/types";
import { HOOK_EVENTS } from "@eddie/hooks";
import type { HookBus } from "@eddie/hooks";
import type { Logger } from "pino";
import type { AgentInvocation } from "../../src/agents/agent-invocation";
import type { AgentRuntimeDescriptor } from "../../src/agents/agent-runtime.types";
import { AgentRunner } from "../../src/agents/agent-runner";
import type { StreamRendererService } from "@eddie/io";

describe("AgentRunner", () => {
  it("runs the provider stream lifecycle and emits hooks, tool results, and compaction callbacks", async () => {
    const agentDefinition = {
      id: "agent-1",
      systemPrompt: "You are helpful.",
      tools: [],
    };

    const invocation = {
      definition: agentDefinition,
      prompt: "List files",
      context: { files: [], totalBytes: 0, text: "" },
      history: [],
      messages: [
        { role: "system", content: agentDefinition.systemPrompt },
        { role: "user", content: "List files" },
      ],
      toolRegistry: {
        schemas: vi.fn().mockReturnValue([]),
        execute: vi
          .fn()
          .mockResolvedValue({
            schema: "tool.echo.result",
            content: "done",
            data: { output: "done" },
          } satisfies ToolResult),
      },
      children: [],
      parent: undefined,
      isRoot: false,
      id: agentDefinition.id,
    } as unknown as AgentInvocation;

    const createStream = (events: StreamEvent[]): AsyncIterable<StreamEvent> => ({
      [Symbol.asyncIterator]: async function* () {
        for (const event of events) {
          yield event;
        }
      },
    });

    const providerStream = vi
      .fn()
      .mockReturnValueOnce(
        createStream([
          {
            type: "tool_call",
            id: "call-1",
            name: "echo",
            arguments: { input: "value" },
          },
          { type: "end", responseId: "resp-1" },
        ])
      )
      .mockReturnValueOnce(
        createStream([
          { type: "delta", text: "Hello" },
          { type: "delta", text: " world" },
          {
            type: "notification",
            payload: "Heads up",
            metadata: { severity: "info" },
          },
          { type: "end" },
        ])
      );

    const descriptor: AgentRuntimeDescriptor = {
      id: agentDefinition.id,
      definition: agentDefinition,
      model: "gpt-test",
      provider: {
        name: "openai",
        stream: providerStream,
      },
    };

    const composeToolSchemas = vi
      .fn<[], ToolSchema[] | undefined>()
      .mockReturnValue([
        {
          type: "function",
          name: "echo",
          description: "Echo back",
          parameters: { type: "object" },
        },
      ]);

    const dispatchHookOrThrow = vi.fn().mockResolvedValue({ results: [] });

    const writeTrace = vi.fn().mockResolvedValue(undefined);

    const applyTranscriptCompactionIfNeeded = vi
      .fn()
      .mockResolvedValue(undefined);

    const hooks = {
      emitAsync: vi.fn().mockResolvedValue({}),
    } as unknown as { emitAsync: HookBus["emitAsync"]; };

    const logger: Logger = {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;

    const streamRenderer: StreamRendererService = {
      render: vi.fn(),
      flush: vi.fn(),
    } as unknown as StreamRendererService;

    const lifecycle = {
      metadata: {
        id: invocation.id,
        parentId: undefined,
        depth: 0,
        isRoot: false,
        systemPrompt: agentDefinition.systemPrompt,
        tools: [],
      },
      prompt: invocation.prompt,
      context: { totalBytes: 0, fileCount: 0 },
      historyLength: invocation.history.length,
    };

    const runner = new AgentRunner({
      invocation,
      descriptor,
      streamRenderer,
      hooks,
      logger,
      cwd: "/tmp",
      confirm: vi.fn(),
      composeToolSchemas,
      executeSpawnTool: vi
        .fn()
        .mockImplementation(async () => ({
          schema: "spawn.result",
          content: "child",
        } satisfies ToolResult)),
      applyTranscriptCompactionIfNeeded,
      dispatchHookOrThrow,
      writeTrace,
      lifecycle,
      startTraceAppend: true,
    });

    await runner.run();

    expect(providerStream).toHaveBeenCalledTimes(2);
    expect(hooks.emitAsync).toHaveBeenCalledTimes(8);
    expect(hooks.emitAsync.mock.calls.map((call) => call[0])).toEqual([
      HOOK_EVENTS.beforeAgentStart,
      HOOK_EVENTS.beforeModelCall,
      HOOK_EVENTS.stop,
      HOOK_EVENTS.beforeModelCall,
      HOOK_EVENTS.notification,
      HOOK_EVENTS.stop,
      HOOK_EVENTS.afterAgentComplete,
      HOOK_EVENTS.subagentStop,
    ]);

    expect(composeToolSchemas).toHaveBeenCalled();
    expect(applyTranscriptCompactionIfNeeded).toHaveBeenCalledTimes(2);
    expect(applyTranscriptCompactionIfNeeded).toHaveBeenNthCalledWith(
      1,
      1,
      expect.objectContaining({ iteration: 1 })
    );
    expect(applyTranscriptCompactionIfNeeded).toHaveBeenNthCalledWith(
      2,
      2,
      expect.objectContaining({ iteration: 2 })
    );
    expect(dispatchHookOrThrow).toHaveBeenCalledWith(
      HOOK_EVENTS.preToolUse,
      expect.objectContaining({
        iteration: 1,
        event: expect.objectContaining({ name: "echo" }),
      })
    );
    expect(dispatchHookOrThrow).toHaveBeenCalledWith(
      HOOK_EVENTS.postToolUse,
      expect.objectContaining({
        iteration: 1,
        result: expect.objectContaining({ schema: "tool.echo.result" }),
      })
    );

    expect(invocation.toolRegistry.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: "echo" }),
      expect.objectContaining({ cwd: "/tmp" })
    );

    const finalMessage = invocation.messages.at(-1);
    expect(finalMessage).toEqual({ role: "assistant", content: "Hello world" });

    const toolMessage = invocation.messages.at(-2);
    expect(toolMessage).toMatchObject({
      role: "tool",
      name: "echo",
      tool_call_id: "call-1",
    });

    const parsedToolPayload = JSON.parse(toolMessage?.content ?? "{}");
    expect(parsedToolPayload).toEqual({
      schema: "tool.echo.result",
      content: "done",
      data: { output: "done" },
    });

    expect(streamRenderer.flush).toHaveBeenCalled();
    expect(streamRenderer.render).toHaveBeenCalledWith(
      expect.objectContaining({ type: "delta", text: "Hello" })
    );
    expect(streamRenderer.render).toHaveBeenCalledWith(
      expect.objectContaining({ type: "tool_result", id: "call-1" })
    );

    expect(writeTrace).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "agent_start" }),
      true
    );
  });

  it("builds subagent results with cloned context and history metadata", () => {
    const childContext: PackedContext = {
      files: [
        { id: "file-1", path: "notes.txt", text: "remember this", bytes: 32 },
      ],
      text: "workspace",
      totalBytes: 32,
      resources: [
        {
          id: "bundle-123",
          type: "bundle",
          text: "bundle content",
          files: [
            { id: "bundle-file", path: "bundle.md", text: "docs", bytes: 10 },
          ],
        },
      ],
    };

    const childHistory = [
      { role: "user" as const, content: "Initial request" },
      { role: "assistant" as const, content: "Acknowledged" },
    ];

    const childInvocation = {
      context: childContext,
      history: childHistory,
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "Initial request" },
        { role: "assistant", content: " Completed successfully.  " },
      ],
    } as unknown as Pick<AgentInvocation, "context" | "history" | "messages">;

    const descriptor: AgentRuntimeDescriptor = {
      id: "child-agent",
      definition: { id: "child-agent", systemPrompt: "" },
      model: "gpt-child",
      provider: { name: "openai", stream: async function* () { /* noop */ } },
    };

    const parentDescriptor: AgentRuntimeDescriptor = {
      id: "parent-agent",
      definition: { id: "parent-agent", systemPrompt: "" },
      model: "gpt-parent",
      provider: { name: "openai", stream: async function* () { /* noop */ } },
    };

    const requestContext: PackedContext = {
      files: [],
      text: "override",
      totalBytes: 0,
      resources: [
        { id: "bundle-999", type: "bundle", text: "override" },
      ],
    };

    const result = AgentRunner.buildSubagentResult({
      child: childInvocation as AgentInvocation,
      descriptor,
      parentDescriptor,
      request: {
        prompt: "Handle the delegated task",
        variables: { priority: "high" },
        context: requestContext,
        metadata: { origin: "user-action" },
      },
    });

    expect(result.schema).toBe("eddie.tool.spawn_subagent.result.v1");
    expect(result.content).toBe("Completed successfully.");
    expect(result.data).toMatchObject({
      agentId: "child-agent",
      messageCount: 3,
      prompt: "Handle the delegated task",
      finalMessage: "Completed successfully.",
      variables: { priority: "high" },
      transcriptSummary:
        "User: Initial request | Assistant: Completed successfully.",
      historySnippet:
        "User: Initial request | Assistant: Completed successfully.",
    });
    expect(result.metadata).toMatchObject({
      agentId: "child-agent",
      parentAgentId: "parent-agent",
      contextBundleIds: ["bundle-123"],
      historySnippet:
        "User: Initial request | Assistant: Completed successfully.",
      transcriptSummary:
        "User: Initial request | Assistant: Completed successfully.",
      finalMessage: "Completed successfully.",
      request: { origin: "user-action" },
    });

    expect(result.data?.context).toEqual({
      files: childContext.files,
      text: childContext.text,
      totalBytes: childContext.totalBytes,
      resources: childContext.resources,
      selectedBundleIds: ["bundle-123"],
    });

    expect(result.data?.history).toEqual(childHistory);
    expect(result.data?.history).not.toBe(childHistory);
    expect(result.data?.context).not.toBe(childContext);

    childContext.files.push({
      id: "mutated",
      path: "mutated.txt",
      text: "mutated",
      bytes: 1,
    });
    childHistory.push({ role: "assistant", content: "mutated" });

    expect(result.data?.context?.files).toHaveLength(1);
    expect(result.data?.history).toHaveLength(2);
  });

  it("adds selected bundle ids to the request context snapshot", () => {
    const childInvocation = {
      context: {
        files: [],
        resources: [],
        text: "",
        totalBytes: 0,
      },
      history: [],
      messages: [
        { role: "system", content: "system" },
        { role: "assistant", content: "done" },
      ],
    } as unknown as AgentInvocation;

    const descriptor: AgentRuntimeDescriptor = {
      id: "child-agent",
      definition: { id: "child-agent", systemPrompt: "" },
      model: "gpt-child",
      provider: { name: "openai", stream: async function* () { /* noop */ } },
    };

    const parentDescriptor: AgentRuntimeDescriptor = {
      id: "parent-agent",
      definition: { id: "parent-agent", systemPrompt: "" },
      model: "gpt-parent",
      provider: { name: "openai", stream: async function* () { /* noop */ } },
    };

    const requestContext: PackedContext = {
      files: [],
      text: "",
      totalBytes: 0,
      resources: [
        { id: "bundle-override", type: "bundle", text: "override" },
      ],
    };

    const result = AgentRunner.buildSubagentResult({
      child: childInvocation,
      descriptor,
      parentDescriptor,
      request: {
        prompt: "",
        context: requestContext,
      },
    });

    expect(result.data?.requestContext?.selectedBundleIds).toEqual([
      "bundle-override",
    ]);

    requestContext.resources?.push({
      id: "mutated",
      type: "bundle",
      text: "mutated",
    });

    expect(result.data?.requestContext?.selectedBundleIds).toEqual([
      "bundle-override",
    ]);
  });
});

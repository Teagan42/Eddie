import { describe, expect, it, vi } from "vitest";
import { AgentMemoryCoordinator } from "../../src/memory/agent-memory-coordinator";
import type { AgentInvocation } from "../../src/agents/agent-invocation";
import type { AgentRuntimeDescriptor } from "@eddie/types";

describe("AgentMemoryCoordinator", () => {
  const descriptor = {
    id: "manager",
    definition: { id: "manager", systemPrompt: "be helpful" },
    provider: { name: "mock" },
    model: "test-model",
    metadata: { memory: { recall: true } },
  } as unknown as AgentRuntimeDescriptor;

  it("uses the runtime session id when recalling agent memories", async () => {
    const loadAgentMemories = vi
      .fn()
      .mockResolvedValue([{ role: "assistant", content: "stored" }]);
    const persistAgentMemories = vi.fn();
    const coordinator = new AgentMemoryCoordinator({
      loadAgentMemories,
      persistAgentMemories,
    } as any);

    const binding = await coordinator.createBinding({
      descriptor,
      invocation: { prompt: "hello" } as AgentInvocation,
      runtime: {
        sessionId: "session-123",
        memoryDefaults: { enabled: true },
      } as any,
    });

    expect(binding).toBeDefined();

    await binding!.prepareProviderMessages({
      messages: [],
      invocation: { prompt: "hello" } as AgentInvocation,
      descriptor,
    });

    expect(loadAgentMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-123",
      }),
    );
  });

  it("applies runtime defaults when agent memory overrides omit flags", async () => {
    const loadAgentMemories = vi.fn().mockResolvedValue([]);
    const persistAgentMemories = vi.fn();
    const coordinator = new AgentMemoryCoordinator({
      loadAgentMemories,
      persistAgentMemories,
    } as any);

    const binding = await coordinator.createBinding({
      descriptor: {
        ...descriptor,
        metadata: {
          memory: { facets: { defaultStrategy: "agent" } },
        },
      },
      invocation: { prompt: "hello" } as AgentInvocation,
      runtime: {
        sessionId: "session-123",
        memoryDefaults: {
          enabled: true,
          recall: true,
          store: true,
        } as any,
      },
    });

    expect(binding).toBeDefined();

    await binding!.prepareProviderMessages({
      messages: [],
      invocation: { prompt: "hello" } as AgentInvocation,
      descriptor,
    });

    expect(loadAgentMemories).toHaveBeenCalled();

    await binding!.finalize({
      invocation: { prompt: "hello" } as AgentInvocation,
      descriptor,
      newMessages: [
        {
          role: "assistant",
          content: "Here you go",
        },
      ],
      failed: false,
    });

    expect(persistAgentMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-123",
        memories: [
          {
            role: "assistant",
            content: "Here you go",
          },
        ],
      }),
    );
  });

  it("creates a memory binding using runtime defaults when metadata omits memory", async () => {
    const loadAgentMemories = vi.fn().mockResolvedValue([]);
    const persistAgentMemories = vi.fn();
    const coordinator = new AgentMemoryCoordinator({
      loadAgentMemories,
      persistAgentMemories,
    } as any);

    const descriptorWithoutMemory = {
      ...descriptor,
      metadata: undefined,
    } as AgentRuntimeDescriptor;

    const binding = await coordinator.createBinding({
      descriptor: descriptorWithoutMemory,
      invocation: { prompt: "hello" } as AgentInvocation,
      runtime: {
        sessionId: "session-456",
        memoryDefaults: {
          enabled: true,
          recall: true,
          store: true,
        } as any,
      },
    });

    expect(binding).toBeDefined();

    await binding!.prepareProviderMessages({
      messages: [],
      invocation: { prompt: "hello" } as AgentInvocation,
      descriptor: descriptorWithoutMemory,
    });

    expect(loadAgentMemories).toHaveBeenCalled();

    await binding!.finalize({
      invocation: { prompt: "hello" } as AgentInvocation,
      descriptor: descriptorWithoutMemory,
      newMessages: [
        {
          role: "assistant",
          content: "Stored from defaults",
        },
      ],
      failed: false,
    });

    expect(persistAgentMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-456",
        memories: [
          {
            role: "assistant",
            content: "Stored from defaults",
          },
        ],
      }),
    );
  });
});

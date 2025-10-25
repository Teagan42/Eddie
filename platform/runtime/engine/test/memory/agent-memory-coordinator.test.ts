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

  it("places recalled memories before the final prompt message", async () => {
    const loadAgentMemories = vi
      .fn()
      .mockResolvedValue([{ role: "assistant", content: "stored" }]);
    const coordinator = new AgentMemoryCoordinator({
      loadAgentMemories,
      persistAgentMemories: vi.fn(),
    } as any);

    const messages = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
    ];

    const binding = await coordinator.createBinding({
      descriptor,
      invocation: { prompt: "hello" } as AgentInvocation,
      runtime: {
        sessionId: "session-789",
        memoryDefaults: { enabled: true },
      } as any,
    });

    const prepared = await binding!.prepareProviderMessages({
      messages,
      invocation: { prompt: "hello" } as AgentInvocation,
      descriptor,
    });

    expect(prepared).toHaveLength(messages.length + 1);
    expect(prepared.at(-1)).toEqual(messages.at(-1));
    expect(prepared.at(-2)).toEqual({ role: "assistant", content: "stored" });
  });

  it("does not duplicate recalled memories on repeated preparation", async () => {
    const recalled = [{ role: "assistant", content: "remember this" }];
    const loadAgentMemories = vi.fn().mockResolvedValue(recalled);
    const coordinator = new AgentMemoryCoordinator({
      loadAgentMemories,
      persistAgentMemories: vi.fn(),
    } as any);

    const binding = await coordinator.createBinding({
      descriptor,
      invocation: { prompt: "hello" } as AgentInvocation,
      runtime: {
        sessionId: "session-101",
        memoryDefaults: { enabled: true },
      } as any,
    });

    const initial = await binding!.prepareProviderMessages({
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hello" },
      ],
      invocation: { prompt: "hello" } as AgentInvocation,
      descriptor,
    });

    const second = await binding!.prepareProviderMessages({
      messages: initial,
      invocation: { prompt: "hello" } as AgentInvocation,
      descriptor,
    });

    expect(second).toEqual(initial);
    expect(second.at(-1)?.role).toBe("user");
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

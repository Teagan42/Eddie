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
});

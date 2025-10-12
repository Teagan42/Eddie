import { describe, it, expect, vi } from "vitest";
import type { TemplateVariables, TemplateRendererService } from "@eddie/templates";
import type { ChatMessage, PackedContext } from "@eddie/types";
import { AgentInvocationFactory } from "../../src/agents/agent-invocation.factory";
import type { AgentDefinition } from "../../src/agents/agent-definition";
import type { ToolRegistryFactory } from "@eddie/tools";

class StubTemplateRendererService {
  renderTemplate = vi.fn(async (_descriptor: unknown, variables: TemplateVariables = {}) => {
    return String(variables.prompt ?? "");
  });

  renderString = vi.fn(async (template: string, _variables: TemplateVariables = {}) => {
    return template;
  });
}

class StubToolRegistryFactory {
  create = vi.fn(
    () => ({}) as ReturnType<ToolRegistryFactory["create"]>
  );
}

describe("AgentInvocationFactory", () => {
  it("does not leak context or history mutations across invocations", async () => {
    const templateRenderer = new StubTemplateRendererService();
    const toolRegistryFactory = new StubToolRegistryFactory();
    const factory = new AgentInvocationFactory(
      toolRegistryFactory as unknown as ToolRegistryFactory,
      templateRenderer as unknown as TemplateRendererService
    );

    const definition: AgentDefinition = {
      id: "planner",
      systemPrompt: "Be helpful.",
    };

    const sharedContext: PackedContext = {
      files: [],
      totalBytes: 0,
      text: "initial context",
    };

    const sharedHistory: ChatMessage[] = [
      { role: "assistant", content: "initial reply" },
    ];

    const firstInvocation = await factory.create(definition, {
      prompt: "Plan work",
      context: sharedContext,
      history: sharedHistory,
    });

    firstInvocation.context.text = "first invocation context";
    firstInvocation.history[0]!.content = "first invocation reply";

    const secondInvocation = await factory.create(definition, {
      prompt: "Plan work",
      context: sharedContext,
      history: sharedHistory,
    });

    expect(secondInvocation.context.text).toBe("initial context");
    expect(secondInvocation.history[0]?.content).toBe("initial reply");
    expect(secondInvocation.messages[1]?.content).toBe("initial reply");
  });
});

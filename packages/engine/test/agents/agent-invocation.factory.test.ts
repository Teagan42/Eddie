import { beforeEach, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { ChatMessage, PackedContext } from "@eddie/types";
import { AgentInvocationFactory } from "../../src/agents/agent-invocation.factory";
import type { AgentDefinition } from "../../src/agents/agent-definition";
import { ToolRegistryFactory } from "@eddie/tools";
import { TemplateRuntimeService } from "../../src/templating/template-runtime.service";

class TemplateRuntimeStub {
  renderSystemPrompt = vi.fn(async () => ({
    systemPrompt: "system",
    variables: { systemPrompt: "system" },
  }));

  renderUserPrompt = vi.fn(async () => "prompt");
}

class StubToolRegistryFactory {
  create = vi.fn(
    () => ({}) as ReturnType<ToolRegistryFactory["create"]>
  );
}

describe("AgentInvocationFactory", () => {
  let factory: AgentInvocationFactory;
  let templateRuntime: TemplateRuntimeStub;
  let toolRegistryFactory: StubToolRegistryFactory;

  beforeEach(async () => {
    templateRuntime = new TemplateRuntimeStub();
    toolRegistryFactory = new StubToolRegistryFactory();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentInvocationFactory,
        { provide: TemplateRuntimeService, useValue: templateRuntime },
        { provide: ToolRegistryFactory, useValue: toolRegistryFactory },
      ],
    }).compile();

    const runtime = moduleRef.get(TemplateRuntimeService);
    const tools = moduleRef.get(ToolRegistryFactory);

    factory = new AgentInvocationFactory(
      tools as unknown as ToolRegistryFactory,
      runtime
    );
  });

  it("does not leak context or history mutations across invocations", async () => {
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

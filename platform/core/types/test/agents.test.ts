import { describe, it, expectTypeOf, expect } from "vitest";
import type {
  AgentDefinition,
  AgentInvocationOptions,
  AgentInvocationRuntimeDetails,
  AgentRuntimeCatalog,
  AgentRuntimeDescriptor,
  AgentRuntimeMetadata,
  AgentSpawnHandler,
} from "@eddie/types";

import type { ToolDefinition, PackedContext, ChatMessage } from "@eddie/types";

describe("@eddie/types agent contracts", () => {
  it("exposes dedicated agent entrypoint", async () => {
    await expect(import("@eddie/types/agents")).resolves.toHaveProperty("AgentDefinition");
  });

  it("exposes agent definition contract", () => {
    expectTypeOf<AgentDefinition>().toMatchTypeOf<{
      id: string;
      systemPrompt: string;
      systemPromptTemplate?: unknown;
      userPromptTemplate?: unknown;
      variables?: unknown;
      context?: PackedContext;
      tools?: ToolDefinition[];
    }>();
  });

  it("exposes invocation contracts", () => {
    expectTypeOf<AgentInvocationOptions>().toMatchTypeOf<{
      prompt: string;
      context?: PackedContext;
      history?: ChatMessage[];
    }>();

    expectTypeOf<AgentInvocationRuntimeDetails>().toMatchTypeOf<{
      provider: string;
      model: string;
      metadata?: Record<string, unknown> | undefined;
    }>();
  });

  it("exposes spawn handler contract", () => {
    expectTypeOf<AgentSpawnHandler>().parameters.toMatchTypeOf<[
      AgentDefinition,
      AgentInvocationOptions,
    ]>();
  });

  it("exposes runtime catalog contracts", () => {
    expectTypeOf<AgentRuntimeMetadata>().toMatchTypeOf<{
      name?: string;
      description?: string;
      routingThreshold?: number;
      profileId?: string;
    }>();

    expectTypeOf<AgentRuntimeDescriptor>().toMatchTypeOf<{
      id: string;
      definition: AgentDefinition;
      model: string;
      provider: unknown;
      metadata?: AgentRuntimeMetadata;
    }>();

    expectTypeOf<AgentRuntimeCatalog>().toMatchTypeOf<{
      enableSubagents: boolean;
      getManager(): AgentRuntimeDescriptor;
      getAgent(id: string): AgentRuntimeDescriptor | undefined;
      getSubagent(id: string): AgentRuntimeDescriptor | undefined;
      listSubagents(): AgentRuntimeDescriptor[];
    }>();
  });
});

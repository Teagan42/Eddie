import { describe, it, expectTypeOf } from "vitest";
import type {
  AgentLifecyclePayload,
  CliRuntimeOptions,
  ConfigPreviewPayload,
  ConfigSchemaPayload,
  ConfigSourcePayload,
  ConfigSourceRequestPayload,
  ContextUpdateSourceType,
  EddieConfig,
  EddieConfigInput,
  ExecutionContextBundle,
  ExecutionAgentNode,
  ExecutionToolInvocationNode,
  ExecutionTreeState,
  HookEventMap,
  MCPToolSourceConfig,
  ProviderAdapter,
  ProviderAdapterFactory,
  ProviderConfig,
  SessionStartPayload,
  ToolSourceConfig,
  ToolCallStatus,
} from "@eddie/types";

type ProviderFactoryContract = {
  readonly name: string;
  create(config: ProviderConfig): ProviderAdapter;
  listModels(config: ProviderConfig): Promise<string[]>;
};

describe("@eddie/types shared contracts", () => {
  it("exposes provider factory contract", () => {
    expectTypeOf<ProviderAdapterFactory>().toMatchTypeOf<ProviderFactoryContract>();
    expectTypeOf<ProviderAdapterFactory>().not.toMatchTypeOf<never>();
  });

  it("exposes configuration contracts", () => {
    expectTypeOf<ProviderConfig>().toMatchTypeOf<{
      name: string;
      baseUrl?: string | undefined;
      apiKey?: string | undefined;
    }>();

    expectTypeOf<EddieConfig>().toHaveProperty("provider").toMatchTypeOf<ProviderConfig>();
    expectTypeOf<CliRuntimeOptions>().toHaveProperty("config").toMatchTypeOf<string | undefined>();
  });

  it("exposes tool source configuration contracts", () => {
    expectTypeOf<ToolSourceConfig>().toMatchTypeOf<MCPToolSourceConfig>();
    expectTypeOf<MCPToolSourceConfig>().toMatchTypeOf<{
      id: string;
      type: "mcp";
      url: string;
    }>();
  });

  it("exposes hook payload map", () => {
    expectTypeOf<HookEventMap>().toHaveProperty("sessionStart").toMatchTypeOf<SessionStartPayload>();
    expectTypeOf<AgentLifecyclePayload>().toHaveProperty("metadata").toMatchTypeOf<{
      id: string;
    }>();
  });

  it("exposes API DTO payload shapes", () => {
    expectTypeOf<ConfigSchemaPayload>().toMatchTypeOf<{
      id: string;
      version: string;
    }>();

    expectTypeOf<ConfigSourcePayload>().toHaveProperty("input").toMatchTypeOf<EddieConfigInput>();
    expectTypeOf<ConfigPreviewPayload>().toMatchTypeOf<{
      input: unknown;
      config: EddieConfig;
    }>();

    expectTypeOf<ConfigSourceRequestPayload>().toHaveProperty("content").toMatchTypeOf<string>();
    expectTypeOf<ConfigSourceRequestPayload>().toHaveProperty("format").toMatchTypeOf<ConfigSourceRequestPayload["format"]>();

    // @ts-expect-error path overrides are no longer accepted on request payloads
    const invalidPayload: ConfigSourceRequestPayload = {
      content: "model: gpt-4",
      format: "yaml",
      path: "./eddie.config.yaml",
    };
    void invalidPayload;
  });

  it("exposes execution tree contracts", () => {
    expectTypeOf<ToolCallStatus>().toEqualTypeOf<
      "pending" | "running" | "completed" | "failed"
    >();

    expectTypeOf<ExecutionToolInvocationNode>().toMatchTypeOf<{
      id: string;
      agentId: string;
      name: string;
      status: ToolCallStatus;
      metadata?: Record<string, unknown>;
      children: ExecutionToolInvocationNode[];
    }>();

    expectTypeOf<ExecutionContextBundle>().toHaveProperty("source").toMatchTypeOf<{
      type: ContextUpdateSourceType;
      agentId: string;
      toolCallId: string;
    }>();

    expectTypeOf<ExecutionTreeState>().toMatchTypeOf<{
      agentHierarchy: ExecutionAgentNode[];
      toolInvocations: ExecutionToolInvocationNode[];
      contextBundles: ExecutionContextBundle[];
      agentLineageById: Record<string, string[]>;
      toolGroupsByAgentId: Record<string, Record<ToolCallStatus, ExecutionToolInvocationNode[]>>;
      contextBundlesByAgentId: Record<string, ExecutionContextBundle[]>;
      contextBundlesByToolCallId: Record<string, ExecutionContextBundle[]>;
      createdAt: string;
      updatedAt: string;
    }>();

    const enrichedState: ExecutionTreeState = {
      agentHierarchy: [],
      toolInvocations: [],
      contextBundles: [],
      agentLineageById: {},
      toolGroupsByAgentId: {},
      contextBundlesByAgentId: {},
      contextBundlesByToolCallId: {},
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };

    expectTypeOf(enrichedState.agentLineageById).toEqualTypeOf<Record<string, string[]>>();
  });
});

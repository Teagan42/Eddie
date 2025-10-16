import { describe, it, expectTypeOf } from "vitest";
import type {
  AgentLifecyclePayload,
  CliRuntimeOptions,
  ConfigPreviewPayload,
  ConfigSchemaPayload,
  ConfigSourcePayload,
  ConfigSourceRequestPayload,
  EddieConfig,
  EddieConfigInput,
  HookEventMap,
  MCPToolSourceConfig,
  ProviderAdapter,
  ProviderAdapterFactory,
  ProviderConfig,
  SessionStartPayload,
  ToolSourceConfig,
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
  });
});

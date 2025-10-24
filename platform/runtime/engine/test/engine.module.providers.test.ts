import { describe, expect, it } from "vitest";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { getLoggerToken } from "@eddie/io";
import {
  TEMPLATE_RUNTIME_LOGGER_SCOPE,
  TemplateRuntimeService,
  templateRuntimeProviders,
} from "@eddie/templates";
import { EngineModule } from "../src/engine.module";
import {
  TRANSCRIPT_COMPACTOR_FACTORY,
  transcriptCompactorFactoryProvider,
} from "../src/transcript/transcript-compactor.factory";
import { MetricsService } from "../src/telemetry/metrics.service";
import { Mem0MemoryModule } from "../../memory/src/mem0.memory.module";
import { ConfigModule, ConfigStore } from "@eddie/config";
import type { CliRuntimeOptions, EddieConfig } from "@eddie/types";
import { MODULE_OPTIONS_TOKEN } from "@eddie/config/config.const";
import {
  MEM0_MEMORY_MODULE_OPTIONS_TOKEN,
  type Mem0MemoryModuleOptions,
} from "../../memory/src/mem0.memory.module-definition";

function getMetadataArray<T = unknown>(key: string): T[] {
  const metadata = Reflect.getMetadata(key, EngineModule);
  return Array.isArray(metadata) ? metadata : [];
}

describe("EngineModule runtime providers", () => {
  it("reuses template runtime providers", () => {
    const providers = getMetadataArray(MODULE_METADATA.PROVIDERS);

    expect(providers).toEqual(
      expect.arrayContaining([
        ...templateRuntimeProviders,
        expect.objectContaining({
          provide: getLoggerToken(TEMPLATE_RUNTIME_LOGGER_SCOPE),
        }),
        expect.objectContaining({
          provide: TRANSCRIPT_COMPACTOR_FACTORY,
          useFactory: transcriptCompactorFactoryProvider.useFactory,
        }),
      ])
    );
  });

  it("exports template runtime service", () => {
    const exportsList = getMetadataArray(MODULE_METADATA.EXPORTS);

    expect(exportsList).toEqual(
      expect.arrayContaining([TemplateRuntimeService])
    );
  });

  it("does not export metrics service", () => {
    const exportsList = getMetadataArray(MODULE_METADATA.EXPORTS);

    expect(exportsList).not.toContain(MetricsService);
  });

  it("registers mem0 memory module with config-driven options", async () => {
    const importsList = getMetadataArray<unknown>(MODULE_METADATA.IMPORTS);
    const dynamicModule = importsList.find(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry && typeof entry === "object" && "module" in entry),
    );

    expect(dynamicModule).toBeDefined();
    expect(dynamicModule?.module).toBe(Mem0MemoryModule);
    expect(dynamicModule?.imports).toEqual(
      expect.arrayContaining([ConfigModule]),
    );

    const optionsProvider = (dynamicModule?.providers as unknown[]).find(
      (provider): provider is {
        provide: unknown;
        useFactory: (...args: unknown[]) => Mem0MemoryModuleOptions | Promise<Mem0MemoryModuleOptions>;
        inject?: unknown[];
      } =>
        Boolean(
          provider &&
            typeof provider === "object" &&
            "provide" in provider &&
            provider.provide === MEM0_MEMORY_MODULE_OPTIONS_TOKEN,
        ),
    );

    expect(optionsProvider).toBeDefined();
    expect(optionsProvider?.inject).toEqual(
      expect.arrayContaining([ConfigStore, MODULE_OPTIONS_TOKEN]),
    );

    const config: EddieConfig = {
      version: 1,
      projectDir: process.cwd(),
      model: "gpt-4o", // irrelevant
      provider: { name: "openai" },
      context: { include: [], baseDir: process.cwd() },
      memory: {
        enabled: true,
        facets: { defaultStrategy: "semantic" },
        vectorStore: {
          provider: "qdrant",
          qdrant: {
            url: "https://qdrant.example", // http mode
            apiKey: "vector-key",
            collection: "agent-memories",
            timeoutMs: 4200,
          },
        },
      },
      agents: { mode: "single" },
    } as EddieConfig;

    const cliOverrides = {
      mem0ApiKey: "cli-api-key",
      mem0Host: "https://mem0.example",
    } as CliRuntimeOptions;

    const options = await optionsProvider!.useFactory(
      { getSnapshot: () => config } as unknown as ConfigStore,
      cliOverrides,
    );

    expect(options.credentials).toEqual({
      apiKey: "cli-api-key",
      host: "https://mem0.example",
    });

    expect(options.vectorStore).toMatchObject({
      type: "qdrant",
      url: "https://qdrant.example",
      apiKey: "vector-key",
      collection: "agent-memories",
      timeoutMs: 4200,
    });

    const facets = options.facetExtractor?.extract(
      [
        {
          role: "assistant",
          content: "remember this",
          metadata: {
            facets: { topic: "support" },
          },
        },
      ],
      {
        metadata: {
          facets: { urgency: "low" },
        },
      },
    );

    expect(facets).toEqual(
      expect.objectContaining({
        strategy: "semantic",
        topic: "support",
        urgency: "low",
      }),
    );
  });
});

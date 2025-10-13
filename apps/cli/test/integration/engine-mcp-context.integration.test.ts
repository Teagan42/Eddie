import "reflect-metadata";
import { Buffer } from "buffer";
import { describe, it, expect, vi } from "vitest";
import { EngineService, AgentInvocationFactory } from "@eddie/engine";
import {
  ConfigStore,
  type EddieConfig,
  type MCPToolSourceConfig,
} from "@eddie/config";
import type { ContextService } from "@eddie/context";
import type { ProviderFactoryService } from "@eddie/providers";
import { HookBus, type HooksService } from "@eddie/hooks";
import {
  type ConfirmService,
  type LoggerService as LoggerServiceType,
} from "@eddie/io";
import type { TokenizerService } from "@eddie/tokenizers";
import type { McpToolSourceService } from "@eddie/mcp";
import { TemplateRendererService } from "@eddie/templates";
import { ToolRegistryFactory } from "@eddie/tools";
import type { AgentOrchestratorService } from "@eddie/engine";
import type { PackedContext } from "@eddie/types";
import type { Logger } from "pino";

describe("EngineService MCP resource integration", () => {
  it("injects discovered MCP resources into context and template rendering", async () => {
    const sourceConfig: MCPToolSourceConfig = {
      id: "docs",
      type: "mcp",
      url: "https://example.invalid/rpc",
    };

    const config: EddieConfig = {
      model: "gpt-mock",
      provider: { name: "mock-provider" },
      projectDir: process.cwd(),
      context: { include: [], baseDir: process.cwd() },
      systemPrompt: "fallback",
      logLevel: "info",
      logging: { level: "info" },
      output: {},
      tools: { sources: [sourceConfig] },
      hooks: {},
      tokenizer: {},
      agents: {
        mode: "manager",
        manager: {
          prompt:
            "Docs: {% for resource in context.resources %}{{ resource.metadata.uri }}{% if not loop.last %}, {% endif %}{% endfor %}",
        },
        subagents: [],
        enableSubagents: false,
      },
    };

    const baseContext: PackedContext = {
      files: [],
      totalBytes: 0,
      text: "",
      resources: [],
    };

    const contextService = {
      pack: vi.fn(async () => ({ ...baseContext, resources: [] })),
    } as unknown as ContextService;

    const hookBus = new HookBus();
    const hooksService = {
      load: vi.fn(async () => hookBus),
    } as unknown as HooksService;

    const store = new ConfigStore();
    store.setSnapshot(config);

    const providerFactory = {
      create: vi.fn(() => ({ name: "mock", stream: vi.fn() })),
    } as unknown as ProviderFactoryService;

    const confirmService = {
      create: vi.fn(() => async () => true),
    } as unknown as ConfirmService;

    const tokenizerService = {
      create: vi.fn(() => ({ countTokens: vi.fn(() => 0) })),
    } as unknown as TokenizerService;

    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;
    const loggerService: Pick<LoggerServiceType, "configure" | "getLogger"> = {
      configure: vi.fn(),
      getLogger: vi.fn(() => logger),
    };

    const templateRenderer = new TemplateRendererService();
    const renderSpy = vi.spyOn(templateRenderer, "renderString");
    const agentInvocationFactory = new AgentInvocationFactory(
      new ToolRegistryFactory(),
      templateRenderer
    );

    const orchestrator = {
      runAgent: vi.fn(async (request) =>
        agentInvocationFactory.create(
          request.definition,
          {
            prompt: request.prompt,
            context: request.context,
            history: request.history,
          },
          request.parent
        )
      ),
      collectInvocations: vi.fn((invocation) => [invocation]),
    } as unknown as AgentOrchestratorService;

    const discoveredResource = {
      sourceId: sourceConfig.id,
      name: "api docs",
      description: "Latest API reference",
      uri: "https://example.com/docs",
      mimeType: "text/markdown",
      metadata: { version: "1.2.3" },
    };

    const mcpToolSourceService = {
      collectTools: vi.fn(async () => ({
        tools: [],
        resources: [discoveredResource],
        prompts: [],
      })),
    } as unknown as McpToolSourceService;

    const engine = new EngineService(
      store,
      contextService,
      providerFactory,
      hooksService,
      confirmService,
      tokenizerService,
      loggerService as LoggerServiceType,
      orchestrator,
      mcpToolSourceService
    );

    const result = await engine.run("Summarize docs");

    expect(contextService.pack).toHaveBeenCalledWith(config.context);
    expect(mcpToolSourceService.collectTools).toHaveBeenCalledWith(config.tools?.sources);

    const resources = result.context.resources ?? [];
    expect(resources).toHaveLength(1);
    const [resource] = resources;
    expect(resource.id).toBe("mcp:docs:api-docs");
    expect(resource.type).toBe("template");
    expect(resource.name).toBe("api docs");
    expect(resource.description).toBe("Latest API reference");
    expect(resource.text).toContain(discoveredResource.uri);
    expect(resource.text).toContain(discoveredResource.mimeType!);
    expect(resource.metadata).toMatchObject({
      sourceId: discoveredResource.sourceId,
      uri: discoveredResource.uri,
      mimeType: discoveredResource.mimeType,
      attributes: discoveredResource.metadata,
    });

    expect(result.context.text).toContain("// Resource: api docs - Latest API reference");
    expect(result.context.text).toContain("// End Resource: api docs");

    const expectedBytes = Buffer.byteLength(resource.text, "utf-8");
    expect(result.context.totalBytes).toBe(expectedBytes);

    expect(renderSpy).toHaveBeenCalled();
    const [systemTemplate, renderVariables] = renderSpy.mock.calls[0];
    expect(systemTemplate).toBe(config.agents.manager.prompt);
    expect(renderVariables.context.resources).toEqual(resources);

    const systemMessage = result.messages[0]?.content;
    expect(systemMessage).toBe("Docs: https://example.com/docs");
  });
});

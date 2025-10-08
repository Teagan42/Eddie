import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { ConfigService } from "../../../src/config/config.service";
import { DEFAULT_CONFIG, DEFAULT_SYSTEM_PROMPT } from "../../../src/config/defaults";
import type { CliRuntimeOptions, EddieConfig, EddieConfigInput } from "../../../src/config/types";

describe("ConfigService agent configuration", () => {
  const createService = () => new ConfigService();

  const cloneConfig = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value)) as T;

  it("merges manager prompts, subagents, and routing data", () => {
    const service = createService();
    const base = cloneConfig(DEFAULT_CONFIG);
    const input: EddieConfigInput = {
      agents: {
        manager: { prompt: "Lead agent" },
        subagents: [
          { id: "reviewer", prompt: "Review code" },
          { id: "tester", description: "Validate outputs" },
        ],
        routing: { maxDepth: 3 },
      },
    };

    const merged = (service as unknown as {
      mergeConfig(base: EddieConfig, input: EddieConfigInput): EddieConfig;
    }).mergeConfig(base, input);

    expect(merged.agents.manager.prompt).toBe("Lead agent");
    expect(merged.agents.subagents).toEqual(input.agents?.subagents);
    expect(merged.agents.routing).toMatchObject({ maxDepth: 3 });
    expect(base.agents.subagents).toEqual([]);
  });

  it("defaults manager prompt to the resolved system prompt", () => {
    const service = createService();
    const base = cloneConfig(DEFAULT_CONFIG);
    const input: EddieConfigInput = {
      systemPrompt: "You are a specialist manager.",
      agents: {},
    };

    const merged = (service as unknown as {
      mergeConfig(base: EddieConfig, input: EddieConfigInput): EddieConfig;
    }).mergeConfig(base, input);

    expect(merged.systemPrompt).toBe("You are a specialist manager.");
    expect(merged.agents.manager.prompt).toBe("You are a specialist manager.");
  });

  it("applies CLI overrides for agent mode and disabling subagents", () => {
    const service = createService();
    const base = cloneConfig(DEFAULT_CONFIG);
    const overrides: CliRuntimeOptions = {
      agentMode: "router",
      disableSubagents: true,
    };

    const applied = (service as unknown as {
      applyCliOverrides(config: EddieConfig, options: CliRuntimeOptions): EddieConfig;
    }).applyCliOverrides(base, overrides);

    expect(applied.agents.mode).toBe("router");
    expect(applied.agents.enableSubagents).toBe(false);
  });

  it("applies provider profiles when selected via CLI", () => {
    const service = createService();
    const base = cloneConfig(DEFAULT_CONFIG);
    base.providers = {
      claude: {
        provider: { name: "anthropic" },
        model: "claude-3",
      },
    };

    const overrides: CliRuntimeOptions = { provider: "claude" };
    const applied = (service as unknown as {
      applyCliOverrides(
        config: EddieConfig,
        options: CliRuntimeOptions
      ): EddieConfig;
    }).applyCliOverrides(base, overrides);

    expect(applied.provider.name).toBe("anthropic");
    expect(applied.model).toBe("claude-3");
  });

  it("applies CLI tool enable/disable overrides", () => {
    const service = createService();
    const base = cloneConfig(DEFAULT_CONFIG);
    base.tools = { enabled: ["bash"], disabled: ["write"] };
    const overrides: CliRuntimeOptions = {
      tools: ["lint"],
      disabledTools: ["bash"],
    };

    const applied = (service as unknown as {
      applyCliOverrides(config: EddieConfig, options: CliRuntimeOptions): EddieConfig;
    }).applyCliOverrides(base, overrides);

    expect(applied.tools?.enabled).toEqual(["lint"]);
    expect(applied.tools?.disabled).toEqual(["bash"]);
    expect(applied.tools?.autoApprove).toBe(base.tools?.autoApprove);
  });

  it("disables context packing when requested via CLI", () => {
    const service = createService();
    const base = cloneConfig(DEFAULT_CONFIG);
    const overrides: CliRuntimeOptions = {
      disableContext: true,
    };

    const applied = (service as unknown as {
      applyCliOverrides(config: EddieConfig, options: CliRuntimeOptions): EddieConfig;
    }).applyCliOverrides(base, overrides);

    expect(applied.context.include).toEqual([]);
    expect(applied.context.maxFiles).toBe(0);
    expect(applied.context.maxBytes).toBe(0);
    expect(applied.context.resources).toEqual([]);
  });

  it("validates agent definitions", () => {
    const service = createService();
    const invalid = cloneConfig(DEFAULT_CONFIG);
    invalid.agents.subagents = [
      { id: "", prompt: "Missing id" },
    ];

    const act = () =>
      (service as unknown as { validateConfig(config: EddieConfig): void }).validateConfig(
        invalid
      );

    expect(act).toThrowError(/agents\.subagents\[0\]\.id/);

    const thresholdConfig = cloneConfig(DEFAULT_CONFIG);
    thresholdConfig.agents.routing = { confidenceThreshold: 2 };

    const actThreshold = () =>
      (service as unknown as { validateConfig(config: EddieConfig): void }).validateConfig(
        thresholdConfig
      );

    expect(actThreshold).toThrowError(/confidenceThreshold/);
  });

  it("retains default system prompt when no overrides are provided", () => {
    const service = createService();
    const base = cloneConfig(DEFAULT_CONFIG);

    const merged = (service as unknown as {
      mergeConfig(base: EddieConfig, input: EddieConfigInput): EddieConfig;
    }).mergeConfig(base, {});

    expect(merged.agents.manager.prompt).toBe(DEFAULT_SYSTEM_PROMPT);
  });
});

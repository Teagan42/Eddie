import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";

import {
  ConfigService,
  DEFAULT_CONFIG,
  type CliRuntimeOptions,
  type ConfigStore,
  type EddieConfigInput,
} from "@eddie/config";

const clone = <T>(value: T): T => structuredClone(value);

const createService = (defaults = DEFAULT_CONFIG) => {
  const store = { setSnapshot: vi.fn() } as unknown as ConfigStore;
  const moduleOptions = {} as CliRuntimeOptions;
  const providerDefaults = clone(defaults);

  const service = new ConfigService(store, moduleOptions, providerDefaults);

  return { service, store };
};

describe("ConfigService CLI precedence", () => {
  it("overrides config file context with CLI flag to disable context", async () => {
    const configInput: EddieConfigInput = {
      context: {
        include: ["src/**/*"],
      },
    };

    const { service } = createService();

    const composed = await service.compose(configInput, { disableContext: true });

    expect(composed.context.include).toEqual([]);
    expect(composed.context.resources).toEqual([]);
    expect(composed.context.maxFiles).toBe(0);
    expect(composed.context.maxBytes).toBe(0);
  });

  it("uses provider profiles when selected via CLI", async () => {
    const defaults = clone(DEFAULT_CONFIG);
    defaults.providers = {
      claude: {
        provider: { name: "anthropic" },
        model: "claude-3-5",
      },
    };

    const { service } = createService(defaults);

    const composed = await service.compose({}, { provider: "claude" });

    expect(composed.provider.name).toBe("anthropic");
    expect(composed.model).toBe("claude-3-5");
  });

  it("applies CLI tool overrides after config file values", async () => {
    const configInput: EddieConfigInput = {
      tools: {
        enabled: ["bash"],
        disabled: ["write"],
      },
    };
    const cliOverrides: CliRuntimeOptions = {
      tools: ["lint"],
      disabledTools: ["bash"],
      autoApprove: true,
    };

    const { service } = createService();

    const composed = await service.compose(configInput, cliOverrides);

    expect(composed.tools?.enabled).toEqual(["lint"]);
    expect(composed.tools?.disabled).toEqual(["bash"]);
    expect(composed.tools?.autoApprove).toBe(true);
  });

  it("inherits context baseDir from projectDir when unset", async () => {
    const projectDir = "/tmp/eddie-project";
    const configInput = {
      projectDir,
      context: {
        include: ["src/**/*"],
      },
    } as unknown as EddieConfigInput;

    const { service } = createService();

    const composed = await service.compose(configInput);

    expect((composed as unknown as { projectDir: string }).projectDir).toBe(
      projectDir
    );
    expect(composed.context.baseDir).toBe(projectDir);
  });

  it("defaults agent prompt templates to the projectDir", async () => {
    const projectDir = "/tmp/eddie-project";
    const configInput = {
      projectDir,
      agents: {
        manager: {
          prompt: "Hello",
          promptTemplate: {
            file: "manager.jinja",
          },
        },
        subagents: [],
      },
    } as unknown as EddieConfigInput;

    const { service } = createService();

    const composed = await service.compose(configInput);

    expect(composed.agents.manager.promptTemplate?.baseDir).toBe(projectDir);
  });
});

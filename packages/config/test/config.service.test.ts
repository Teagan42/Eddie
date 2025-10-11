import { describe, expect, it, vi } from "vitest";

import type { ConfigStore } from "../src/config.store";
import { ConfigService } from "../src/config.service";
import { DEFAULT_CONFIG } from "../src/defaults";
import type { CliRuntimeOptions, EddieConfig, EddieConfigInput } from "../src/types";

const clone = <T>(value: T): T => structuredClone(value);

const createService = (defaults?: Partial<EddieConfig>) => {
  const configStore = { setSnapshot: vi.fn() } as unknown as ConfigStore;
  const moduleOptions = {} as CliRuntimeOptions;
  const providerDefaults = defaults
    ? { ...clone(DEFAULT_CONFIG), ...defaults }
    : undefined;

  const service = new ConfigService(configStore, moduleOptions, providerDefaults);

  return { service, configStore };
};

describe("ConfigService compose precedence", () => {
  it("starts from the module defaults when no provider overrides exist", async () => {
    const { service } = createService();

    const composed = await service.compose({});

    expect(composed.systemPrompt).toBe(DEFAULT_CONFIG.systemPrompt);
    expect(composed.provider.name).toBe(DEFAULT_CONFIG.provider.name);
  });

  it("applies config file values on top of defaults", async () => {
    const defaults: EddieConfig = {
      ...clone(DEFAULT_CONFIG),
      api: {
        ...(clone(DEFAULT_CONFIG.api) ?? {}),
        host: "defaults.local",
      },
    };
    const configInput: EddieConfigInput = {
      api: { host: "file.local", port: 4242 },
    };

    const { service } = createService(defaults);

    const composed = await service.compose(configInput);

    expect(composed.api?.host).toBe("file.local");
    expect(composed.api?.port).toBe(4242);
  });

  it("applies CLI overrides last", async () => {
    const defaults: EddieConfig = {
      ...clone(DEFAULT_CONFIG),
      model: "defaults-model",
    };
    const configInput: EddieConfigInput = {
      model: "file-model",
      logging: { level: "warn" },
    };
    const cliOverrides: CliRuntimeOptions = {
      model: "cli-model",
      logLevel: "error",
    };

    const { service, configStore } = createService(defaults);

    const composed = await service.compose(configInput, cliOverrides);

    expect(composed.model).toBe("cli-model");
    expect(composed.logging?.level).toBe("error");
    expect(configStore.setSnapshot).toHaveBeenCalledWith(composed);
  });
});

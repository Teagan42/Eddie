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
    expect(configStore.setSnapshot).not.toHaveBeenCalled();
  });
});

describe("ConfigService load lifecycle", () => {
  it("updates the config store when loading configuration", async () => {
    const { service, configStore } = createService();

    const config = await service.load({});

    expect(configStore.setSnapshot).toHaveBeenCalledWith(config);
  });
});

describe("ConfigService API persistence validation", () => {
  const createSqlConnection = () => ({
    host: "localhost",
    port: 5432,
    database: "eddie",
    user: "agent",
    password: "secret",
  });

  it("requires driver configuration when using a SQL driver", async () => {
    const { service } = createService();

    await expect(
      service.compose({
        api: {
          persistence: {
            driver: "postgres",
          },
        },
      }),
    ).rejects.toThrow(
      "api.persistence.postgres must be provided when using the postgres driver.",
    );
  });

  it("allows postgres driver configuration with explicit connection details", async () => {
    const { service } = createService();

    const composed = await service.compose({
      api: {
        persistence: {
          driver: "postgres",
          postgres: {
            connection: createSqlConnection(),
          },
        },
      },
    });

    expect(composed.api?.persistence).toMatchObject({
      driver: "postgres",
      postgres: {
        connection: createSqlConnection(),
      },
    });
  });

  it("rejects optional SQL driver fields when they have the wrong primitive type", async () => {
    const { service } = createService();

    await expect(
      service.compose({
        api: {
          persistence: {
            driver: "postgres",
            postgres: {
              url: 123,
              ssl: "require",
              connection: createSqlConnection(),
            },
          },
        },
      }),
    ).rejects.toThrowError(
      /^api\.persistence\.postgres\.url must be a string when provided\.$/,
    );
  });
});

describe("ConfigService transcript compactor configuration", () => {
  it("applies transcript compactor options from the config file", async () => {
    const { service } = createService();

    const composed = await service.compose({
      transcript: {
        compactor: {
          strategy: "simple",
          maxMessages: 120,
          keepLast: 40,
        },
      } as any,
    });

    expect(composed.transcript?.compactor).toMatchObject({
      strategy: "simple",
      maxMessages: 120,
      keepLast: 40,
    });
  });

  it("retains per-agent transcript overrides separately from global config", async () => {
    const { service } = createService();

    const composed = await service.compose({
      transcript: {
        compactor: {
          strategy: "simple",
          maxMessages: 80,
        },
      } as any,
      agents: {
        manager: {
          transcript: {
            compactor: {
              strategy: "token_budget",
              tokenBudget: 2048,
            },
          },
        },
        subagents: [
          {
            id: "worker",
            transcript: {
              compactor: {
                strategy: "simple",
                maxMessages: 20,
                keepLast: 5,
              },
            },
          },
        ],
      } as any,
    });

    expect(composed.transcript?.compactor?.strategy).toBe("simple");
    expect(composed.agents.manager.transcript?.compactor?.strategy).toBe(
      "token_budget",
    );
    expect(
      composed.agents.subagents[0]?.transcript?.compactor?.maxMessages,
    ).toBe(20);
    expect(
      composed.agents.subagents[0]?.transcript?.compactor?.keepLast,
    ).toBe(5);
  });
});

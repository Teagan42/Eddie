import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import * as runtimeEnv from "../src/runtime-env";
import * as migrations from "../src/migrations";

import type { ConfigStore } from "../src/config.store";
import { ConfigService } from "../src/config.service";
import { DEFAULT_CONFIG } from "../src/defaults";
import type { CliRuntimeOptions, EddieConfig, EddieConfigInput } from "../src/types";

const clone = <T>(value: T): T => structuredClone(value);

interface CreateServiceOptions {
  defaults?: Partial<EddieConfig>;
  moduleOptions?: CliRuntimeOptions;
}

const createService = (options?: CreateServiceOptions) => {
  const providerDefaults = options?.defaults
    ? { ...clone(DEFAULT_CONFIG), ...options.defaults }
    : undefined;
  let snapshot = clone(providerDefaults ?? DEFAULT_CONFIG);
  const configStore = {
    setSnapshot: vi.fn((next: EddieConfig) => {
      snapshot = clone(next);
    }),
    getSnapshot: vi.fn(() => clone(snapshot)),
  } as unknown as ConfigStore;
  const moduleOptions = {
    ...(options?.moduleOptions ?? {}),
  } as CliRuntimeOptions;

  const service = new ConfigService(configStore, moduleOptions, providerDefaults, null);

  return { service, configStore };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ConfigService compose precedence", () => {
  it("does not re-resolve CLI runtime options from the environment", () => {
    const resolverSpy = vi.spyOn(runtimeEnv, "resolveCliRuntimeOptionsFromEnv");
    const moduleOptions = { model: "module-model" } as CliRuntimeOptions;

    new ConfigService(undefined, moduleOptions, undefined, null);

    expect(resolverSpy).not.toHaveBeenCalled();
  });

  it("does not expose an onApplicationBootstrap hook", () => {
    const service = new ConfigService(undefined, {} as CliRuntimeOptions, undefined, null);

    expect("onApplicationBootstrap" in service).toBe(false);
  });

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

    const { service } = createService({ defaults });

    const composed = await service.compose(configInput);

    expect(composed.api?.host).toBe("file.local");
    expect(composed.api?.port).toBe(4242);
  });

  it("keeps default context include when config omits it", async () => {
    const defaults: EddieConfig = {
      ...clone(DEFAULT_CONFIG),
      context: {
        ...clone(DEFAULT_CONFIG.context),
        include: ["defaults/**/*"],
      },
    };
    const configInput: EddieConfigInput = {
      context: {
        exclude: ["**/*.test.ts"],
      },
    };

    const { service } = createService({ defaults });

    const composed = await service.compose(configInput);

    expect(composed.context.include).toEqual(["defaults/**/*"]);
    expect(composed.context.exclude).toEqual(["**/*.test.ts"]);
  });

  it("applies extended configs before file input", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-config-"));
    const externalConfigPath = path.join(tempDir, "extended.json");
    const externalConfig: EddieConfigInput = {
      logging: { level: "warn" },
      tools: { autoApprove: true },
    };

    await fs.writeFile(
      externalConfigPath,
      `${JSON.stringify(externalConfig, null, 2)}\n`,
      "utf-8",
    );

    const { service } = createService();

    const composed = await service.compose({
      extends: [
        { id: "cli-local" },
        { path: externalConfigPath },
      ],
      logging: { level: "error" },
    } satisfies EddieConfigInput);

    expect(composed.logging?.enableTimestamps).toBe(false);
    expect(composed.tools?.autoApprove).toBe(true);
    expect(composed.logging?.level).toBe("error");
    expect(composed.logLevel).toBe("error");
  });

  it("resolves nested extension paths relative to each config file", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-config-"));
    const sharedPath = path.join(tempDir, "shared.yaml");
    const childPath = path.join(tempDir, "child.yaml");
    const mainPath = path.join(tempDir, "main.yaml");

    await fs.writeFile(
      sharedPath,
      "logging:\n  level: warn\ntools:\n  autoApprove: true\n",
      "utf-8",
    );

    await fs.writeFile(
      childPath,
      "extends:\n  - ./shared.yaml\nlogging:\n  enableTimestamps: true\n",
      "utf-8",
    );

    const { service } = createService();

    const composed = await service.compose(
      {
        extends: ["./child.yaml"],
        logging: { level: "error" },
      },
      {},
      { path: mainPath },
    );

    expect(composed.tools?.autoApprove).toBe(true);
    expect(composed.logging?.enableTimestamps).toBe(true);
    expect(composed.logging?.level).toBe("error");
  });

  it("deep merges tools configuration across extensions", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-config-"));
    const firstPath = path.join(tempDir, "first.json");
    const secondPath = path.join(tempDir, "second.json");

    await fs.writeFile(
      firstPath,
      `${JSON.stringify(
        {
          tools: {
            enabled: ["alpha"],
            sources: [
              {
                id: "source-alpha",
                type: "mcp",
                url: "https://alpha.example.com",
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    await fs.writeFile(
      secondPath,
      `${JSON.stringify(
        {
          tools: {
            enabled: ["beta"],
            sources: [
              {
                id: "source-beta",
                type: "mcp",
                url: "https://beta.example.com",
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const defaults: EddieConfig = {
      ...clone(DEFAULT_CONFIG),
      tools: {
        ...(clone(DEFAULT_CONFIG.tools ?? {}) ?? {}),
        enabled: [],
        sources: [],
      },
    };

    const { service } = createService({ defaults });

    const composed = await service.compose({
      extends: [
        { path: firstPath },
        { path: secondPath },
      ],
    });

    expect(composed.tools?.enabled).toEqual(["alpha", "beta"]);
    expect(composed.tools?.sources).toEqual([
      {
        id: "source-alpha",
        type: "mcp",
        url: "https://alpha.example.com",
      },
      {
        id: "source-beta",
        type: "mcp",
        url: "https://beta.example.com",
      },
    ]);
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

    const { service, configStore } = createService({ defaults });

    const composed = await service.compose(configInput, cliOverrides);

    expect(composed.model).toBe("cli-model");
    expect(composed.logging?.level).toBe("error");
    expect(configStore.setSnapshot).not.toHaveBeenCalled();
  });

  it("preserves module preset when CLI override is undefined", async () => {
    const moduleOptions = { preset: "api-host" } as CliRuntimeOptions;
    const { service } = createService({ moduleOptions });

    const composed = await service.compose(
      {},
      { preset: undefined } as CliRuntimeOptions,
    );

    expect(composed.api?.port).toBe(8080);
  });

  it("merges presets before config files and CLI overrides", async () => {
    const { service } = createService();

    const composed = await service.compose(
      {
        api: { host: "file.local" },
      },
      { preset: "api-host" } satisfies CliRuntimeOptions,
    );

    expect(composed.api?.host).toBe("file.local");
    expect(composed.api?.port).toBe(8080);
  });

  it("applies api-host telemetry defaults", async () => {
    const { service } = createService();

    const composed = await service.compose({}, { preset: "api-host" });

    expect(composed.api?.telemetry?.enabled).toBe(true);
    expect(composed.api?.cors?.origin).toEqual(["http://localhost:5173"]);
  });

  it("exposes demo seed fixtures through the demo-web preset", async () => {
    const { service } = createService();

    const composed = await service.compose({}, { preset: "demo-web" });

    expect(composed.demoSeeds).toMatchObject({
      chatSessions: expect.stringContaining(
        "examples/demo-agent-screenshots/data/chat-sessions.json",
      ),
      agentInvocations: expect.stringContaining(
        "examples/demo-agent-screenshots/data/agent-invocations.json",
      ),
      traces: expect.stringContaining(
        "examples/demo-agent-screenshots/data/traces.json",
      ),
      logs: expect.stringContaining(
        "examples/demo-agent-screenshots/data/logs.json",
      ),
      runtimeConfig: expect.stringContaining(
        "examples/demo-agent-screenshots/data/runtime-config.json",
      ),
    });
  });

  it("provides guidance when an unknown preset is requested", async () => {
    const { service } = createService();

    await expect(service.compose({}, { preset: "missing" })).rejects.toThrow(
      /Unknown configuration preset: missing\. Available presets: .* Use --preset <name> to apply a preset\./,
    );
  });
});

describe("ConfigService compose migrations", () => {
  it("rejects configs that declare a newer version than supported", async () => {
    const { service } = createService();

    await expect(
      service.compose({ version: 999 } as unknown as EddieConfigInput),
    ).rejects.toThrow(/newer config version/i);
  });

  it("assigns the current version when composing configs without one", async () => {
    const { service } = createService();

    const composed = await service.compose({} as EddieConfigInput);

    expect(typeof composed.version).toBe("number");
    expect(composed.version).toBe(migrations.CURRENT_CONFIG_VERSION);
  });

  it("applies migration output and logs warnings when present", async () => {
    const runSpy = vi
      .spyOn(migrations, "runConfigMigrations")
      .mockReturnValue({
        initialVersion: 0,
        finalVersion: migrations.CURRENT_CONFIG_VERSION,
        appliedMigrations: ["0001-add-config-version"],
        warnings: ["manual step required"],
        migrated: {
          version: migrations.CURRENT_CONFIG_VERSION,
          model: "migrated",
        },
      });
    const warnSpy = vi.spyOn(Logger.prototype, "warn");

    const { service } = createService();

    const composed = await service.compose({ version: 0 } as EddieConfigInput);

    expect(runSpy).toHaveBeenCalledWith({ version: 0 });
    expect(composed.model).toBe("migrated");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("manual step required"),
    );
  });

  it("throws when migrations cannot reach the current version", async () => {
    vi.spyOn(migrations, "runConfigMigrations").mockReturnValue({
      initialVersion: 0,
      finalVersion: migrations.CURRENT_CONFIG_VERSION - 1,
      appliedMigrations: ["incomplete"],
      warnings: [],
      migrated: { version: 0 },
    });

    const { service } = createService();

    await expect(
      service.compose({ version: 0 } as EddieConfigInput),
    ).rejects.toThrow(/Unable to automatically migrate config version/);
  });
});

describe("ConfigService load lifecycle", () => {
  it("updates the config store when loading configuration", async () => {
    const { service, configStore } = createService();

    const config = await service.load({});

    expect(configStore.setSnapshot).toHaveBeenCalledWith(config);
  });

  it("returns the stored snapshot when a config store is provided", async () => {
    const { service, configStore } = createService();

    const config = await service.load({});

    expect(configStore.getSnapshot).toHaveBeenCalled();
    const lastSnapshot = configStore.getSnapshot.mock.results.at(-1)?.value;
    expect(lastSnapshot).toEqual(config);
  });
});

describe("ConfigService readSnapshot", () => {
  it("uses the injected config file path and module options", async () => {
    const configPath = "/virtual/config/eddie.config.yaml";
    const moduleOptions = {
      config: configPath,
      model: "module-model",
    } as CliRuntimeOptions;
    const service = new ConfigService(undefined, moduleOptions, undefined, configPath);

    const readFile = vi
      .spyOn(fs, "readFile")
      .mockResolvedValue("model: file-model");
    const readConfigFile = vi
      .spyOn(
        service as unknown as {
          readConfigFile(candidate: string): Promise<EddieConfigInput>;
        },
        "readConfigFile",
      )
      .mockResolvedValue({ model: "file-model" });
    const compose = vi
      .spyOn(service, "compose")
      .mockResolvedValue({ model: "composed" } as EddieConfig);

    const snapshot = await service.readSnapshot();

    expect(readFile).toHaveBeenCalledWith(configPath, "utf-8");
    expect(readConfigFile).toHaveBeenCalledWith(configPath);
    expect(compose).toHaveBeenCalledWith(
      { model: "file-model" },
      moduleOptions,
      { path: configPath },
    );
    expect(snapshot.path).toBe(configPath);
    expect(snapshot.config?.model).toBe("composed");
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
    ).rejects.toMatchObject({
      summary: expect.stringMatching(/configuration/i),
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: "api.persistence.postgres",
          message: expect.stringContaining("must be provided"),
        }),
      ]),
    });
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
    ).rejects.toMatchObject({
      summary: expect.stringMatching(/configuration/i),
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: "api.persistence.postgres.url",
          message: expect.stringContaining("string"),
        }),
      ]),
    });
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

describe("ConfigService writeSource", () => {
  it("writes to the injected config file path when available", async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "config-service-write-")
    );
    const destination = path.join(tmpDir, "custom.config.yaml");
    const configStore = {
      setSnapshot: vi.fn(),
      getSnapshot: vi.fn(),
    } as unknown as ConfigStore;
    const service = new ConfigService(
      configStore,
      {} as CliRuntimeOptions,
      undefined,
      destination
    );

    try {
      const snapshot = await service.writeSource("logLevel: warn\n", "yaml");

      expect(snapshot.path).toBe(destination);
      const written = await fs.readFile(destination, "utf-8");
      expect(written).toBe("logLevel: warn\n");
      expect(configStore.setSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ logLevel: "warn" })
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

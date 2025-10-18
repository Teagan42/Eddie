import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetRuntimeOptionsCache,
  setRuntimeOptionsFromArgv,
} from "../../../src/runtime-options";
import { CliRuntimeOptions } from '@eddie/config';

const hoisted = vi.hoisted(() => {
  const loadMock = vi.fn();
  const ensureMock = vi.fn();
  const getSnapshotMock = vi.fn();
  const setSnapshotMock = vi.fn();
  const configureOpenApiMock = vi.fn();
  const applyCorsMock = vi.fn();
  const useMock = vi.fn();
  const listenMock = vi.fn();
  const createMock = vi.fn();
  const configureLoggerMock = vi.fn();
  const apiForRootMock = vi.fn();

  class ConfigServiceStub {
    load = loadMock;
  }

  class ConfigStoreStub {
    setSnapshot = setSnapshotMock;
    getSnapshot = getSnapshotMock;
  }

  class LoggerServiceStub {
    configure = configureLoggerMock;
  }

  class HttpLoggerMiddlewareStub {
    use = useMock;
  }

  return {
    stubs: {
      loadMock,
      ensureMock,
      getSnapshotMock,
      setSnapshotMock,
      configureOpenApiMock,
      applyCorsMock,
      useMock,
      listenMock,
      createMock,
      configureLoggerMock,
      apiForRootMock,
    },
    ConfigServiceStub,
    ConfigStoreStub,
    LoggerServiceStub,
    HttpLoggerMiddlewareStub,
  };
});

const {
  stubs,
  ConfigStoreStub,
  LoggerServiceStub,
  HttpLoggerMiddlewareStub,
} = hoisted;

vi.mock("../../../src/api.module", () => ({
  ApiModule: {
    forRoot: stubs.apiForRootMock,
  },
}));

vi.mock("../../../src/config-root", () => ({
  ensureDefaultConfigRoot: stubs.ensureMock,
}));

vi.mock("@nestjs/core", () => ({
  NestFactory: {
    create: stubs.createMock,
  },
}));

vi.mock("@nestjs/platform-ws", () => ({
  WsAdapter: class {},
}));

vi.mock(
  "@eddie/config",
  async () => {
    const actual = await vi.importActual<typeof import("@eddie/config")>(
      "@eddie/config",
    );
    return {
      ...actual,
      ConfigModule: class {},
      ConfigService: hoisted.ConfigServiceStub,
      ConfigStore: hoisted.ConfigStoreStub,
    };
  },
);

vi.mock(
  "@eddie/io",
  () => ({
    IoModule: class {},
    LoggerService: LoggerServiceStub,
    createLoggerProviders: () => [],
  }),
);

vi.mock("../../../src/middleware/http-logger.middleware", () => ({
  HttpLoggerMiddleware: HttpLoggerMiddlewareStub,
}));

vi.mock("../../../src/telemetry/tracing", () => ({
  initTracing: vi.fn(),
}));

vi.mock("../../../src/cors", () => ({
  applyCorsConfig: stubs.applyCorsMock,
}));

vi.mock("../../../src/openapi-config", () => ({
  configureOpenApi: stubs.configureOpenApiMock,
}));

describe("bootstrap runtime options", () => {
  const originalEnv = { ...process.env };
  const originalArgv = process.argv.slice();

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.argv = originalArgv.slice(0, 2);
    resetRuntimeOptionsCache();
    vi.clearAllMocks();

    stubs.getSnapshotMock.mockReturnValue({ api: {} });

    stubs.createMock.mockResolvedValue({
      enableShutdownHooks: vi.fn(),
      useWebSocketAdapter: vi.fn(),
      get: (token: unknown) => {
        if (token === ConfigStoreStub) {
          return new ConfigStoreStub();
        }

        if (token === LoggerServiceStub) {
          return new LoggerServiceStub();
        }

        if (token === HttpLoggerMiddlewareStub) {
          return new HttpLoggerMiddlewareStub();
        }

        return undefined;
      },
      flushLogs: vi.fn(),
      use: vi.fn(),
      listen: stubs.listenMock,
    });

    stubs.apiForRootMock.mockReturnValue({});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    process.argv = originalArgv.slice();
    resetRuntimeOptionsCache();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it.skip("does not call ConfigService.load when runtime overrides provided", async () => {
    stubs.listenMock.mockResolvedValue(undefined);

    process.argv = [
      "node",
      "main.js",
      "--config",
      "/tmp/eddie.yaml",
      "--context",
      "src,docs",
      "--context",
      "tests",
      "--tools",
      "lint,format",
      "--disable-tools",
      "write",
      "--jsonl-trace",
      "trace.jsonl",
      "--log-level",
      "debug",
      "--log-file",
      "eddie.log",
      "--agent-mode",
      "router",
      "--disable-subagents",
      "--auto-approve",
      "--non-interactive",
      "--provider",
      "anthropic",
      "--model",
      "claude-3",
    ];

    setRuntimeOptionsFromArgv(process.argv.slice(2));

    const { bootstrap } = await import("../../../src/main");

    await bootstrap();

    expect(stubs.loadMock).not.toHaveBeenCalled();
    expect(stubs.createMock).toHaveBeenCalledTimes(2);
    expect(stubs.listenMock).toHaveBeenCalledTimes(2);
  });

  it.skip("uses ApiModule.forRoot when creating the application", async () => {
    const runtimeOverrides = {
      config: "/tmp/eddie.yaml",
      context: ["src", "docs"],
    } satisfies CliRuntimeOptions

    stubs.apiForRootMock.mockReset();
    const moduleRef = Symbol("api-module");
    stubs.apiForRootMock
      .mockReturnValueOnce({})
      .mockReturnValueOnce(moduleRef);

    process.argv = [
      "node",
      "main.js",
      "--config",
      runtimeOverrides.config!,
      "--context",
      runtimeOverrides.context![0]!,
      "--context",
      runtimeOverrides.context![1]!,
    ];

    const runtimeOptionsModule = await import("../../../src/runtime-options");
    const getRuntimeOptionsSpy = vi
      .spyOn(runtimeOptionsModule, "getRuntimeOptions")
      .mockReturnValueOnce({})
      .mockReturnValueOnce({
        config: runtimeOverrides.config,
        context: runtimeOverrides.context,
      });

    const { bootstrap } = await import("../../../src/main");

    await bootstrap();

    expect(stubs.apiForRootMock).toHaveBeenCalledTimes(2);
    const lastCall = stubs.apiForRootMock.mock.calls.at(-1);
    expect(lastCall?.[0]).toEqual({
      config: runtimeOverrides.config,
      context: runtimeOverrides.context,
    });

    const createArgs = stubs.createMock.mock.calls.at(-1);
    expect(createArgs?.[0]).toBe(moduleRef);

    getRuntimeOptionsSpy.mockRestore();
  });

  it.skip("merges CLI arguments with environment overrides before bootstrap", async () => {
    stubs.listenMock.mockResolvedValue(undefined);

    process.env.EDDIE_CLI_TOOLS = "lint,format";
    process.env.EDDIE_CLI_LOG_LEVEL = "info";
    process.env.EDDIE_CLI_MODEL = "env-model";

    process.argv = [
      "node",
      "main.js",
      "--model",
      "cli-model",
      "--context",
      "src",
      "--context",
      "docs",
      "--log-level",
      "debug",
    ];

    const { bootstrap } = await import("../../../src/main");

    await bootstrap();

    const lastCall = stubs.apiForRootMock.mock.calls.at(-1);
    expect(lastCall?.[0]).toMatchObject({
      context: ["src", "docs"],
      tools: ["lint", "format"],
      logLevel: "debug",
      model: "cli-model",
    });
  });
});

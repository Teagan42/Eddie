import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetRuntimeOptionsCache,
  setRuntimeOptionsFromArgv,
} from "../../../src/runtime-options";

const stubs = vi.hoisted(() => ({
  loadMock: vi.fn(),
  ensureMock: vi.fn(),
  getSnapshotMock: vi.fn(),
  setSnapshotMock: vi.fn(),
  configureOpenApiMock: vi.fn(),
  applyCorsMock: vi.fn(),
  useMock: vi.fn(),
  listenMock: vi.fn(),
  createMock: vi.fn(),
  configureLoggerMock: vi.fn(),
  apiForRootMock: vi.fn(),
}));

class ConfigServiceStub {
  load = stubs.loadMock;
}

class ConfigStoreStub {
  setSnapshot = stubs.setSnapshotMock;
  getSnapshot = stubs.getSnapshotMock;
}

class LoggerServiceStub {
  configure = stubs.configureLoggerMock;
}

class HttpLoggerMiddlewareStub {
  use = stubs.useMock;
}

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
      ConfigService: ConfigServiceStub,
      ConfigStore: ConfigStoreStub,
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
  { virtual: true },
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
  const originalArgv = process.argv.slice();

  beforeEach(() => {
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

        if (token === ConfigServiceStub) {
          return new ConfigServiceStub();
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
    process.argv = originalArgv.slice();
    resetRuntimeOptionsCache();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("passes CLI flags through to ConfigService.load", async () => {
    stubs.loadMock.mockResolvedValue({ api: {} });
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

    expect(stubs.loadMock).toHaveBeenCalledWith({
      config: "/tmp/eddie.yaml",
      context: ["src", "docs", "tests"],
      tools: ["lint", "format"],
      disabledTools: ["write"],
      jsonlTrace: "trace.jsonl",
      logLevel: "debug",
      logFile: "eddie.log",
      agentMode: "router",
      disableSubagents: true,
      autoApprove: true,
      nonInteractive: true,
      provider: "anthropic",
      model: "claude-3",
    });
    expect(stubs.createMock).toHaveBeenCalledTimes(2);
    expect(stubs.listenMock).toHaveBeenCalledTimes(2);
  });

  it("uses ApiModule.forRoot when creating the application", async () => {
    const runtimeOverrides = {
      config: "/tmp/eddie.yaml",
      context: ["src", "docs"],
    } satisfies Parameters<typeof setRuntimeOptionsFromArgv>[0];

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
});

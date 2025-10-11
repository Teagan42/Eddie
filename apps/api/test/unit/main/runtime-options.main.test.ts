import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetRuntimeOptionsCache,
  setRuntimeOptionsFromArgv,
} from "../../../src/runtime-options";

const stubs = vi.hoisted(() => ({
  loadMock: vi.fn(),
  ensureMock: vi.fn(),
  configureOpenApiMock: vi.fn(),
  applyCorsMock: vi.fn(),
  useMock: vi.fn(),
  listenMock: vi.fn(),
  createMock: vi.fn(),
  configureLoggerMock: vi.fn(),
}));

class ConfigServiceStub {
  load = stubs.loadMock;
}

class LoggerServiceStub {
  configure = stubs.configureLoggerMock;
}

class HttpLoggerMiddlewareStub {
  use = stubs.useMock;
}

vi.mock("../../../src/api.module", () => ({
  ApiModule: class {},
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
  () => ({
    ConfigModule: class {},
    ConfigService: ConfigServiceStub,
  }),
  { virtual: true },
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

    stubs.createMock.mockResolvedValue({
      enableShutdownHooks: vi.fn(),
      useWebSocketAdapter: vi.fn(),
      get: (token: unknown) => {
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
    expect(stubs.createMock).toHaveBeenCalledTimes(1);
    expect(stubs.listenMock).toHaveBeenCalledTimes(1);
  });
});

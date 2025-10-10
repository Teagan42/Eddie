import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("bootstrap runtime options", () => {
  const originalArgv = process.argv.slice();

  beforeEach(() => {
    vi.resetModules();
    process.argv = originalArgv.slice(0, 2);
  });

  afterEach(async () => {
    process.argv = originalArgv.slice();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("passes CLI flags through to ConfigService.load", async () => {
    const loadMock = vi.fn().mockResolvedValue({ api: {} });
    const ensureMock = vi.fn();
    const configureOpenApiMock = vi.fn().mockResolvedValue(undefined);
    const applyCorsMock = vi.fn();
    const useMock = vi.fn();
    const listenMock = vi.fn().mockResolvedValue(undefined);
    const createMock = vi.fn();

    class ConfigServiceStub {
      load = loadMock;
    }

    class LoggerServiceStub {
      configure = vi.fn();
    }

    class HttpLoggerMiddlewareStub {
      use = useMock;
    }

    vi.doMock("../../../src/config-root", () => ({
      ensureDefaultConfigRoot: ensureMock,
    }));

    vi.doMock("@nestjs/core", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@nestjs/core")>();
      createMock.mockResolvedValue({
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
        listen: listenMock,
      });
      return {
        ...actual,
        NestFactory: {
          create: createMock,
        },
      };
    });

    vi.doMock("@nestjs/platform-ws", () => ({
      WsAdapter: class {},
    }));

    vi.doMock("@eddie/config", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@eddie/config")>();
      return {
        ...actual,
        ConfigService: ConfigServiceStub,
      };
    });

    vi.doMock("@eddie/io", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@eddie/io")>();
      return {
        ...actual,
        LoggerService: LoggerServiceStub,
      };
    });

    vi.doMock("../../../src/middleware/http-logger.middleware", () => ({
      HttpLoggerMiddleware: HttpLoggerMiddlewareStub,
    }));

    vi.doMock("../../../src/telemetry/tracing", () => ({
      initTracing: vi.fn(),
    }));

    vi.doMock("../../../src/cors", () => ({
      applyCorsConfig: applyCorsMock,
    }));

    vi.doMock("../../../src/openapi-config", () => ({
      configureOpenApi: configureOpenApiMock,
    }));

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

    const { bootstrap } = await import("../../../src/main");
    await new Promise((resolve) => setImmediate(resolve));

    loadMock.mockClear();
    configureOpenApiMock.mockClear();
    createMock.mockClear();
    listenMock.mockClear();

    await bootstrap();

    expect(loadMock).toHaveBeenCalledWith({
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
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(listenMock).toHaveBeenCalledTimes(1);
  });
});

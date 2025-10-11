import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("ensureDefaultConfigRoot", () => {
  afterEach(async () => {
    delete process.env.CONFIG_ROOT;
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("sets CONFIG_ROOT to the workspace config directory when missing", async () => {
    const { ensureDefaultConfigRoot } = await import("../../../src/config-root");

    delete process.env.CONFIG_ROOT;

    const result = ensureDefaultConfigRoot();

    expect(result).toBe(path.join(process.cwd(), "config"));
    expect(process.env.CONFIG_ROOT).toBe(path.join(process.cwd(), "config"));
  });

  it("leaves CONFIG_ROOT untouched when already defined", async () => {
    process.env.CONFIG_ROOT = "custom";

    const { ensureDefaultConfigRoot } = await import("../../../src/config-root");

    const result = ensureDefaultConfigRoot();

    expect(result).toBe("custom");
    expect(process.env.CONFIG_ROOT).toBe("custom");
  });

  it("ensures the default config root before bootstrapping the API", async () => {
    const ensureMock = vi.fn().mockReturnValue("mock-root");
    const loadMock = vi.fn().mockResolvedValue({ api: {} });
    const getSnapshotMock = vi.fn().mockResolvedValue({ api: {} });
    const configureMock = vi.fn();
    const configureOpenApiMock = vi.fn().mockResolvedValue(undefined);
    const applyCorsMock = vi.fn();
    const useMock = vi.fn();
    const listenMock = vi.fn().mockResolvedValue(undefined);
    const createMock = vi.fn();

    class ConfigServiceStub {
      load = loadMock;
    }

    class ConfigStoreStub {
      getSnapshot = getSnapshotMock;
    }

    class LoggerServiceStub {
      configure = configureMock;
    }

    class HttpLoggerMiddlewareStub {
      use = useMock;
    }

    const httpLoggerInstance = new HttpLoggerMiddlewareStub();
    const configServiceInstance = new ConfigServiceStub();
    const loggerServiceInstance = new LoggerServiceStub();

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
            return configServiceInstance;
          }

          if (token === LoggerServiceStub) {
            return loggerServiceInstance;
          }

          if (token === HttpLoggerMiddlewareStub) {
            return httpLoggerInstance;
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
        ConfigStore: ConfigStoreStub,
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

    const { bootstrap } = await import("../../../src/main");

    await new Promise((resolve) => setImmediate(resolve));

    ensureMock.mockClear();
    createMock.mockClear();
    listenMock.mockClear();
    configureOpenApiMock.mockClear();

    await bootstrap();

    expect(ensureMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(configureOpenApiMock).toHaveBeenCalledTimes(1);
    expect(ensureMock.mock.invocationCallOrder[0]).toBeLessThan(
      createMock.mock.invocationCallOrder[0]
    );
    expect(listenMock).toHaveBeenCalledTimes(1);
  });
});

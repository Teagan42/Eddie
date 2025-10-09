import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigService, type EddieConfig } from "@eddie/config";
import { ContextService } from "@eddie/context";
import { LoggerService } from "@eddie/io";
import { ApiModule } from "../../src/api.module";
import { HealthController } from "../../src/controllers/health.controller";
import { ApiValidationPipe } from "../../src/validation.pipe";
import { ApiKeyGuard } from "../../src/auth/api-key.guard";
import { ApiHttpExceptionFilter } from "../../src/http-exception.filter";
import { RequestLoggingInterceptor } from "../../src/logging.interceptor";
import { ApiCacheInterceptor } from "../../src/cache.interceptor";
import { HttpLoggerMiddleware } from "../../src/middleware/http-logger.middleware";

const createExecutionContext = (request: Partial<Request>): ExecutionContext =>
  ({
    getType: () => "http",
    switchToHttp: () => ({
      getRequest: () => request as Request,
      getResponse: () => ({}),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as unknown as ExecutionContext;

describe("ApiModule integration", () => {
  let app: INestApplication;
  let configService: ConfigService;
  let contextService: ContextService;
  let validationPipeStub: {
    onModuleInit: ReturnType<typeof vi.fn>;
    transform: ReturnType<typeof vi.fn>;
  };
  let exceptionFilterStub: {
    onModuleInit: ReturnType<typeof vi.fn>;
    catch: ReturnType<typeof vi.fn>;
  };
  let guardStub: {
    onModuleInit: ReturnType<typeof vi.fn>;
    canActivate: ReturnType<typeof vi.fn>;
  };
  let requestLoggingInterceptorStub: {
    onModuleInit: ReturnType<typeof vi.fn>;
    intercept: ReturnType<typeof vi.fn>;
  };
  let cacheInterceptorStub: {
    onModuleInit: ReturnType<typeof vi.fn>;
    intercept: ReturnType<typeof vi.fn>;
  };
  let httpLoggerMiddlewareStub: {
    use: ReturnType<typeof vi.fn>;
  };

  const createLoggerStub = () => {
    const stub = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    };
    stub.child.mockReturnValue(stub);
    return stub;
  };

  let loggerStubs: Record<string, ReturnType<typeof createLoggerStub>>;

  const config: EddieConfig = {
    logLevel: "debug",
    context: {
      baseDir: process.cwd(),
      includes: [],
      excludes: [],
      variables: { apiKeys: ["context-key"] },
      maxFiles: 0,
      maxBytes: 0,
    },
    api: {
      validation: {
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
        enableImplicitConversion: true,
      },
      telemetry: { exposeErrorStack: true },
      auth: {
        enabled: true,
        apiKeys: ["test-key"],
      },
      cache: {
        enabled: true,
        ttlSeconds: 1,
        maxItems: 10,
      },
    },
  } as unknown as EddieConfig;

  beforeEach(async () => {
    const configServiceMock = {
      load: vi.fn().mockResolvedValue(config),
    } as unknown as ConfigService;
    const contextServiceMock = {
      pack: vi.fn().mockResolvedValue({ files: [], totalBytes: 0 }),
    } as unknown as ContextService;
    loggerStubs = {
      root: createLoggerStub(),
      "api:requests": createLoggerStub(),
      "api:auth": createLoggerStub(),
      "api:validation": createLoggerStub(),
      "api:exceptions": createLoggerStub(),
      "api:cache": createLoggerStub(),
      http: createLoggerStub(),
    };
    const getScopedLogger = (scope?: string) =>
      loggerStubs[scope ?? "root"] ?? loggerStubs.root;
    const loggerServiceMock = {
      configure: vi.fn(),
      getLogger: vi.fn((scope?: string) => getScopedLogger(scope)),
      withBindings: vi.fn(() => getScopedLogger()),
      reset: vi.fn(),
    } as unknown as LoggerService;

    validationPipeStub = {
      onModuleInit: vi.fn().mockResolvedValue(undefined),
      transform: vi.fn((value) => value),
    };
    exceptionFilterStub = {
      onModuleInit: vi.fn().mockResolvedValue(undefined),
      catch: vi.fn(),
    };
    guardStub = {
      onModuleInit: vi.fn().mockResolvedValue(undefined),
      canActivate: vi.fn().mockResolvedValue(true),
    };
    requestLoggingInterceptorStub = {
      onModuleInit: vi.fn().mockResolvedValue(undefined),
      intercept: vi.fn((_, next) => next.handle()),
    };
    cacheInterceptorStub = {
      onModuleInit: vi.fn().mockResolvedValue(undefined),
      intercept: vi.fn((_, next) => next.handle()),
    };
    httpLoggerMiddlewareStub = {
      use: vi.fn((_req, _res, next) => next()),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ApiModule],
    })
      .overrideProvider(ConfigService)
      .useValue(configServiceMock)
      .overrideProvider(ContextService)
      .useValue(contextServiceMock)
      .overrideProvider(LoggerService)
      .useValue(loggerServiceMock)
      .overrideProvider(ApiValidationPipe)
      .useValue(validationPipeStub as unknown as ApiValidationPipe)
      .overrideProvider(ApiHttpExceptionFilter)
      .useValue(exceptionFilterStub as unknown as ApiHttpExceptionFilter)
      .overrideProvider(ApiKeyGuard)
      .useValue(guardStub as unknown as ApiKeyGuard)
      .overrideProvider(RequestLoggingInterceptor)
      .useValue(requestLoggingInterceptorStub as unknown as RequestLoggingInterceptor)
      .overrideProvider(ApiCacheInterceptor)
      .useValue(cacheInterceptorStub as unknown as ApiCacheInterceptor)
      .overrideProvider(HttpLoggerMiddleware)
      .useValue(httpLoggerMiddlewareStub as unknown as HttpLoggerMiddleware)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    configService = configServiceMock;
    contextService = contextServiceMock;
  });

  afterEach(async () => {
    await app?.close();
    vi.clearAllMocks();
  });

  it("boots the API module with mocked dependencies", () => {
    const controller = app.get(HealthController);
    expect(controller.check()).toEqual({ status: "ok" });

    expect(app.get(ApiValidationPipe)).toBe(validationPipeStub);
    expect(app.get(ApiHttpExceptionFilter)).toBe(exceptionFilterStub);
    expect(app.get(RequestLoggingInterceptor)).toBe(
      requestLoggingInterceptorStub
    );
    expect(app.get(ApiCacheInterceptor)).toBe(cacheInterceptorStub);
    expect(app.get(HttpLoggerMiddleware)).toBe(httpLoggerMiddlewareStub);
  });

  it("allows the API key guard to validate configured keys", async () => {
    const guard = app.get(ApiKeyGuard) as unknown as typeof guardStub;
    const request = {
      method: "GET",
      originalUrl: "/secure",
      get: vi.fn((header: string) => (header === "x-api-key" ? "test-key" : undefined)),
      headers: { "x-api-key": "test-key" },
      query: {},
    } as unknown as Request;

    await expect(
      guard.canActivate(createExecutionContext(request))
    ).resolves.toBe(true);
    expect(guard.canActivate).toHaveBeenCalledWith(
      expect.objectContaining({ switchToHttp: expect.any(Function) })
    );
  });
});

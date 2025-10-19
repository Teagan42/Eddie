import "reflect-metadata";
import {
  INestApplication,
  Module,
  type ExecutionContext,
  type ModuleMetadata,
} from "@nestjs/common";
import type { Request } from "express";
import { Test } from "@nestjs/testing";
import { WsAdapter } from "@nestjs/platform-ws";
import { Reflector } from "@nestjs/core";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ConfigService,
  ConfigStore,
  type CliRuntimeOptions,
  type EddieConfig,
} from "@eddie/config";
import { ContextService } from "@eddie/context";
import { LoggerService } from "@eddie/io";
import { Subject } from "rxjs";
import { HealthController } from "../../src/controllers/health.controller";
import { ApiValidationPipe } from "../../src/validation.pipe";
import { ApiKeyGuard } from "../../src/auth/api-key.guard";
import { ApiHttpExceptionFilter } from "../../src/http-exception.filter";
import { RequestLoggingInterceptor } from "../../src/logging.interceptor";
import { ApiCacheInterceptor } from "../../src/cache.interceptor";
import { HttpLoggerMiddleware } from "../../src/middleware/http-logger.middleware";
import { ChatSessionsService } from "../../src/chat-sessions/chat-sessions.service";
import { ChatSessionsEngineListener } from "../../src/chat-sessions/chat-sessions-engine.listener";
import { TracesService } from "../../src/traces/traces.service";
import { LogsService } from "../../src/logs/logs.service";
import { RuntimeConfigService } from "../../src/runtime-config/runtime-config.service";
import { RuntimeConfigGateway } from "../../src/runtime-config/runtime-config.gateway";
import type { RuntimeConfigDto } from "../../src/runtime-config/dto/runtime-config.dto";

function createStubModule(
  name: string,
  metadata: ModuleMetadata = {}
) {
  class StubModule {}
  Module(metadata)(StubModule);
  Object.defineProperty(StubModule, "name", { value: name });
  return StubModule;
}

vi.mock("@eddie/context", () => {
  class ContextService {}
  const ContextModule = createStubModule("ContextModule", {
    providers: [ContextService],
    exports: [ContextService],
  });
  return { ContextModule, ContextService };
});

vi.mock("@eddie/engine", () => ({
  EngineModule: createStubModule("EngineModule"),
}));

vi.mock("@eddie/io", () => {
  class LoggerService {}
  const IoModule = createStubModule("IoModule", {
    providers: [LoggerService],
    exports: [LoggerService],
  });
  const createLoggerProviders = () => [
    { provide: LoggerService, useClass: LoggerService },
  ];
  const InjectLogger = () => () => undefined;
  return { IoModule, LoggerService, createLoggerProviders, InjectLogger };
});

vi.mock("../../src/chat-sessions/chat-sessions.module", () => ({
  ChatSessionsModule: createStubModule("ChatSessionsModule"),
}));

vi.mock("../../src/traces/traces.module", () => ({
  TracesModule: createStubModule("TracesModule"),
}));

vi.mock("../../src/logs/logs.module", () => ({
  LogsModule: createStubModule("LogsModule"),
}));

vi.mock("../../src/runtime-config/runtime-config.module", () => ({
  RuntimeConfigModule: createStubModule("RuntimeConfigModule"),
}));

vi.mock("../../src/demo/demo.module", () => ({
  DemoModule: createStubModule("DemoModule"),
}));

vi.mock("../../src/config-editor/config-editor.module", () => ({
  ConfigEditorModule: createStubModule("ConfigEditorModule"),
}));

vi.mock("../../src/user-preferences/user-preferences.module", () => ({
  UserPreferencesModule: createStubModule("UserPreferencesModule"),
}));

vi.mock("../../src/orchestrator/orchestrator.module", () => ({
  OrchestratorModule: createStubModule("OrchestratorModule"),
}));

vi.mock("../../src/providers/providers.module", () => ({
  ProvidersModule: createStubModule("ProvidersModule"),
}));

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

const WS_ADAPTER_PACKAGE = "@nestjs/platform-ws";

let ApiModuleRef: typeof import("../../src/api.module").ApiModule;

vi.setConfig({ hookTimeout: 20_000 });

describe("ApiModule integration", () => {
  let app: INestApplication;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let configService: ConfigService;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let contextService: ContextService;
  let bindStoreSpy: ReturnType<typeof vi.fn>;
  let composeSpy: ReturnType<typeof vi.fn>;
  let validationPipeStub: {
    onModuleInit: ReturnType<typeof vi.fn>;
    transform: ReturnType<typeof vi.fn>;
  };
  let exceptionFilterStub: {
    onModuleInit: ReturnType<typeof vi.fn>;
    catch: ReturnType<typeof vi.fn>;
  };
  let guardOnModuleInitSpy: ReturnType<typeof vi.spyOn>;
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
  let chatSessionsServiceStub: ChatSessionsService;
  let chatSessionsEngineListenerStub: ChatSessionsEngineListener;
  let tracesServiceStub: TracesService;
  let logsServiceStub: LogsService;
  let runtimeConfigServiceStub: RuntimeConfigService;
  let runtimeConfigGatewayStub: RuntimeConfigGateway;
  let runtimeConfigChanges: Subject<RuntimeConfigDto>;
  let configStoreStub: ConfigStore;

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

  const attachGuardDependencies = (
    guard: ApiKeyGuard,
    application: INestApplication
  ): void => {
    const target = guard as unknown as Record<string, unknown>;
    Reflect.set(target, "configStore", configStoreStub);
    Reflect.set(target, "logger", loggerStubs["api:auth"]);
    Reflect.set(target, "reflector", application.get(Reflector));
  };

  const runtimeOptions: CliRuntimeOptions = {};

  const config: EddieConfig = {
    logLevel: "debug",
    projectDir: process.cwd(),
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

  beforeAll(async () => {
    ({ ApiModule: ApiModuleRef } = await import("../../src/api.module"));
    process.env.NEST_DEFAULT_WS_ADAPTER = WS_ADAPTER_PACKAGE;
    bindStoreSpy = vi.fn();
    composeSpy = vi.fn().mockResolvedValue(config);
    const configServiceMock = {
      load: vi.fn().mockResolvedValue(config),
      compose: composeSpy,
      bindStore: bindStoreSpy,
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
      registerListener: vi.fn(() => vi.fn()),
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

    chatSessionsServiceStub = {
      registerListener: vi.fn(() => vi.fn()),
      listSessions: vi.fn().mockResolvedValue([]),
      createSession: vi.fn().mockResolvedValue({
        id: "",
        title: "",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      getSession: vi.fn().mockResolvedValue({
        id: "",
        title: "",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      archiveSession: vi.fn().mockResolvedValue({
        id: "",
        title: "",
        status: "archived",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      listMessages: vi.fn().mockResolvedValue([]),
      addMessage: vi.fn().mockResolvedValue({
        message: {
          id: "",
          sessionId: "",
          role: "user",
          content: "",
          createdAt: new Date().toISOString(),
        },
        session: {
          id: "",
          title: "",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
      updateMessageContent: vi.fn().mockResolvedValue({
        id: "",
        sessionId: "",
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      }),
      saveAgentInvocations: vi.fn().mockResolvedValue(undefined),
      listAgentInvocations: vi.fn().mockResolvedValue([]),
      setAgentActivity: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatSessionsService;

    chatSessionsEngineListenerStub = {
      onModuleInit: vi.fn(),
      onModuleDestroy: vi.fn(),
      onSessionCreated: vi.fn(),
      onSessionUpdated: vi.fn(),
      onSessionDeleted: vi.fn(),
      onMessageCreated: vi.fn(),
    } as unknown as ChatSessionsEngineListener;

    tracesServiceStub = {
      registerListener: vi.fn(() => vi.fn()),
      list: vi.fn(() => []),
      get: vi.fn(() => ({
        id: "",
        name: "",
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      create: vi.fn(),
      updateStatus: vi.fn(),
    } as unknown as TracesService;

    logsServiceStub = {
      registerListener: vi.fn(() => vi.fn()),
      list: vi.fn(() => []),
      append: vi.fn(() => ({
        id: "",
        level: "info",
        message: "",
        createdAt: new Date().toISOString(),
      })),
    } as unknown as LogsService;

    const defaultConfig: RuntimeConfigDto = {
      apiUrl: "http://localhost:3000",
      websocketUrl: "ws://localhost:3000",
      features: {},
      theme: "dark" as const,
    };
    runtimeConfigChanges = new Subject<RuntimeConfigDto>();

    runtimeConfigServiceStub = {
      changes$: runtimeConfigChanges.asObservable(),
      get: vi.fn(() => defaultConfig),
      update: vi.fn((value) => {
        const next: RuntimeConfigDto = {
          ...defaultConfig,
          ...value,
          features:
            value.features !== undefined
              ? { ...defaultConfig.features, ...value.features }
              : defaultConfig.features,
        };
        runtimeConfigChanges.next(next);
        return next;
      }),
    } as unknown as RuntimeConfigService;
    runtimeConfigGatewayStub = {
      onModuleInit: vi.fn(),
      onModuleDestroy: vi.fn(),
      emitConfigUpdated: vi.fn(),
    } as unknown as RuntimeConfigGateway;

    configStoreStub = new ConfigStore(config);

    const moduleRef = await Test.createTestingModule({
      imports: [ApiModuleRef.forRoot(runtimeOptions)],
      providers: [
        {
          provide: ConfigStore,
          useValue: configStoreStub,
        },
      ],
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
      .overrideProvider(RequestLoggingInterceptor)
      .useValue(requestLoggingInterceptorStub as unknown as RequestLoggingInterceptor)
      .overrideProvider(ApiCacheInterceptor)
      .useValue(cacheInterceptorStub as unknown as ApiCacheInterceptor)
      .overrideProvider(HttpLoggerMiddleware)
      .useValue(httpLoggerMiddlewareStub as unknown as HttpLoggerMiddleware)
      .overrideProvider(ChatSessionsService)
      .useValue(chatSessionsServiceStub)
      .overrideProvider(ChatSessionsEngineListener)
      .useValue(chatSessionsEngineListenerStub)
      .overrideProvider(TracesService)
      .useValue(tracesServiceStub)
      .overrideProvider(LogsService)
      .useValue(logsServiceStub)
      .overrideProvider(RuntimeConfigGateway)
      .useValue(runtimeConfigGatewayStub)
      .overrideProvider(RuntimeConfigService)
      .useValue(runtimeConfigServiceStub)
      .compile();

    app = moduleRef.createNestApplication();
    const guardInstance = app.get(ApiKeyGuard);
    attachGuardDependencies(guardInstance, app);
    app.useWebSocketAdapter(new WsAdapter(app));

    configService = configServiceMock;
    contextService = contextServiceMock;

    guardOnModuleInitSpy = vi.spyOn(ApiKeyGuard.prototype, "onModuleInit");

    await app.init();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    delete process.env.NEST_DEFAULT_WS_ADAPTER;
    runtimeConfigChanges?.complete?.();
    await app?.close();
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

    expect(validationPipeStub.onModuleInit).toHaveBeenCalled();
    expect(exceptionFilterStub.onModuleInit).toHaveBeenCalled();
    expect(guardOnModuleInitSpy).toHaveBeenCalled();
  });

  it("allows the API key guard to validate configured keys", async () => {
    const guard = app.get(ApiKeyGuard);
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
    expect(request.get).toHaveBeenCalledWith("x-api-key");
  });
});

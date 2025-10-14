import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Request } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { firstValueFrom, of } from "rxjs";
import type {
  CliRuntimeOptions,
  ConfigService,
  ConfigStore,
  EddieConfig,
} from "@eddie/config";
import * as Config from "@eddie/config";
import { ContextService } from "@eddie/context";
import type { Logger } from "pino";
import { ApiCacheInterceptor } from "../../../src/cache.interceptor";
import * as runtimeOptions from "../../../src/runtime-options";

const createExecutionContext = (request: Partial<Request>): ExecutionContext =>
  ({
    getType: () => "http",
    switchToHttp: () => ({
      getRequest: () => request as Request,
      getResponse: () => ({}),
    }),
  }) as unknown as ExecutionContext;

describe("ApiCacheInterceptor", () => {
  const createConfig = (overrides: Partial<EddieConfig["api"]> = {}): EddieConfig =>
    ({
      logLevel: "info",
      projectDir: process.cwd(),
      context: {
        baseDir: process.cwd(),
        includes: [],
        excludes: [],
        variables: {},
        maxFiles: 0,
        maxBytes: 0,
      },
      api: {
        cache: {
          enabled: true,
          ttlSeconds: 10,
          maxItems: 10,
        },
        auth: {
          enabled: false,
        },
        ...overrides,
      },
    } as unknown as EddieConfig);

  let nowSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    nowSpy = vi.spyOn(Date, "now");
  });

  afterEach(() => {
    nowSpy?.mockRestore();
  });

  it("does not reload configuration when runtime overrides exist", async () => {
    const logger = { debug: vi.fn(), error: vi.fn() };
    const configService = {
      load: vi.fn(),
    } as unknown as ConfigService;
    const contextService = {
      pack: vi.fn().mockResolvedValue({ files: [], totalBytes: 0 }),
    } as unknown as ContextService;
    const store = {
      getSnapshot: vi.fn(() => createConfig()),
      changes$: of(createConfig()),
    } as unknown as ConfigStore;

    vi.spyOn(runtimeOptions, "getRuntimeOptions").mockReturnValue({
      config: "alt.json",
    } as unknown as CliRuntimeOptions);
    vi.spyOn(Config, "hasRuntimeOverrides").mockReturnValue(true);

    const interceptor = new ApiCacheInterceptor(
      configService,
      store,
      contextService,
      logger as unknown as Logger
    );

    await interceptor.onModuleInit();

    expect(configService.load).not.toHaveBeenCalled();
  });

  it("caches GET responses until the entry expires", async () => {
    const logger = { debug: vi.fn(), error: vi.fn() };
    const configService = {
      load: vi.fn(),
    } as unknown as ConfigService;
    const contextService = {
      pack: vi.fn().mockResolvedValue({ files: [], totalBytes: 0 }),
    } as unknown as ContextService;
    const store = {
      getSnapshot: vi.fn(() => createConfig()),
      changes$: of(createConfig()),
    } as unknown as ConfigStore;
    const interceptor = new ApiCacheInterceptor(
      configService,
      store,
      contextService,
      logger as unknown as Logger
    );
    await interceptor.onModuleInit();

    nowSpy!.mockImplementation(() => 1_000);

    const request = {
      method: "GET",
      originalUrl: "/health",
      headers: {},
      get: vi.fn(() => undefined),
      query: {},
    } as unknown as Request;
    const context = createExecutionContext(request);

    const next: CallHandler = {
      handle: vi
        .fn()
        .mockImplementationOnce(() => of({ status: "fresh" }))
        .mockImplementation(() => of({ status: "stale" })),
    };

    const first = await firstValueFrom(interceptor.intercept(context, next));
    const second = await firstValueFrom(interceptor.intercept(context, next));

    expect(first).toEqual({ status: "fresh" });
    expect(second).toEqual({ status: "fresh" });
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ cacheKey: expect.any(String) }),
      "Caching fresh response"
    );
    expect(configService.load).not.toHaveBeenCalled();
  });

  it("bypasses caching for non-GET requests", async () => {
    const logger = { debug: vi.fn(), error: vi.fn() };
    const configService = {
      load: vi.fn(),
    } as unknown as ConfigService;
    const contextService = {
      pack: vi.fn().mockResolvedValue({ files: [], totalBytes: 0 }),
    } as unknown as ContextService;
    const store = {
      getSnapshot: vi.fn(() => createConfig()),
      changes$: of(createConfig()),
    } as unknown as ConfigStore;
    const interceptor = new ApiCacheInterceptor(
      configService,
      store,
      contextService,
      logger as unknown as Logger
    );
    await interceptor.onModuleInit();

    const request = {
      method: "POST",
      originalUrl: "/tasks",
      get: vi.fn(() => undefined),
      headers: {},
      query: {},
    } as unknown as Request;
    const context = createExecutionContext(request);
    const next: CallHandler = { handle: vi.fn(() => of({ status: "created" })) };

    const result = await firstValueFrom(interceptor.intercept(context, next));

    expect(result).toEqual({ status: "created" });
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(logger.debug).not.toHaveBeenCalledWith(
      expect.anything(),
      "Caching fresh response"
    );
    expect(configService.load).not.toHaveBeenCalled();
  });

  it("disables caching when the store snapshot marks it disabled", async () => {
    const logger = { debug: vi.fn(), error: vi.fn() };
    const config = createConfig({
      cache: { enabled: false },
    });
    const configService = {
      load: vi.fn(),
    } as unknown as ConfigService;
    const contextService = {
      pack: vi.fn().mockResolvedValue({ files: [], totalBytes: 0 }),
    } as unknown as ContextService;
    const store = {
      getSnapshot: vi.fn(() => config),
      changes$: of(config),
    } as unknown as ConfigStore;
    const interceptor = new ApiCacheInterceptor(
      configService,
      store,
      contextService,
      logger as unknown as Logger
    );
    await interceptor.onModuleInit();

    const request = {
      method: "GET",
      originalUrl: "/config/first",
      headers: {},
      get: vi.fn(() => undefined),
      query: {},
    } as unknown as Request;
    const context = createExecutionContext(request);
    const next: CallHandler = { handle: vi.fn(() => of({ status: "ok" })) };

    const result = await firstValueFrom(interceptor.intercept(context, next));

    expect(result).toEqual({ status: "ok" });
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(logger.debug).not.toHaveBeenCalledWith(
      expect.anything(),
      "Caching fresh response"
    );
    expect(configService.load).not.toHaveBeenCalled();
  });

  it("derives the context fingerprint from computeStats results", async () => {
    const logger = { debug: vi.fn(), error: vi.fn() };
    const config = createConfig();
    const configService = {
      load: vi.fn(),
    } as unknown as ConfigService;
    const stats = { fileCount: 5, totalBytes: 2048 };
    const computeStats = vi.fn().mockResolvedValue(stats);
    const pack = vi.fn();
    const contextService = {
      computeStats,
      pack,
    } as unknown as ContextService;
    const store = {
      getSnapshot: vi.fn(() => config),
      changes$: of(config),
    } as unknown as ConfigStore;

    const interceptor = new ApiCacheInterceptor(
      configService,
      store,
      contextService,
      logger as unknown as Logger
    );

    await interceptor.onModuleInit();

    expect(computeStats).toHaveBeenCalledWith(config.context);
    expect(pack).not.toHaveBeenCalled();
    const expectedFingerprint = createHash("sha1")
      .update(String(stats.fileCount))
      .update(":")
      .update(String(stats.totalBytes))
      .digest("hex");
    expect((interceptor as unknown as { contextFingerprint: string }).contextFingerprint).toBe(
      expectedFingerprint
    );
  });
});

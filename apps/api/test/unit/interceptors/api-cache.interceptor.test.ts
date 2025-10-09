import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { firstValueFrom, of } from "rxjs";
import type { ConfigService, EddieConfig } from "@eddie/config";
import { ContextService } from "@eddie/context";
import type { Logger } from "pino";
import { ApiCacheInterceptor } from "../../../src/cache.interceptor";

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

  it("caches GET responses until the entry expires", async () => {
    const logger = { debug: vi.fn(), error: vi.fn() };
    const configService = {
      load: vi.fn().mockResolvedValue(createConfig()),
    } as unknown as ConfigService;
    const contextService = {
      pack: vi.fn().mockResolvedValue({ files: [], totalBytes: 0 }),
    } as unknown as ContextService;
    const interceptor = new ApiCacheInterceptor(
      configService,
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
  });

  it("bypasses caching for non-GET requests", async () => {
    const logger = { debug: vi.fn(), error: vi.fn() };
    const configService = {
      load: vi.fn().mockResolvedValue(createConfig()),
    } as unknown as ConfigService;
    const contextService = {
      pack: vi.fn().mockResolvedValue({ files: [], totalBytes: 0 }),
    } as unknown as ContextService;
    const interceptor = new ApiCacheInterceptor(
      configService,
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
  });

  it("waits for configuration before first request when caching is disabled", async () => {
    const logger = { debug: vi.fn(), error: vi.fn() };
    let resolveConfig: ((config: EddieConfig) => void) | undefined;
    const configPromise = new Promise<EddieConfig>((resolve) => {
      resolveConfig = resolve;
    });
    const configService = {
      load: vi.fn().mockReturnValue(configPromise),
    } as unknown as ConfigService;
    const contextService = {
      pack: vi.fn().mockResolvedValue({ files: [], totalBytes: 0 }),
    } as unknown as ContextService;
    const interceptor = new ApiCacheInterceptor(
      configService,
      contextService,
      logger as unknown as Logger
    );

    const request = {
      method: "GET",
      originalUrl: "/config/first",
      headers: {},
      get: vi.fn(() => undefined),
      query: {},
    } as unknown as Request;
    const context = createExecutionContext(request);
    const next: CallHandler = { handle: vi.fn(() => of({ status: "ok" })) };

    const resultPromise = firstValueFrom(interceptor.intercept(context, next));

    await Promise.resolve();
    expect(next.handle).not.toHaveBeenCalled();

    resolveConfig?.(
      createConfig({
        cache: { enabled: false },
      })
    );

    const result = await resultPromise;

    expect(result).toEqual({ status: "ok" });
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(configService.load).toHaveBeenCalledTimes(1);

    await firstValueFrom(interceptor.intercept(context, next));

    expect(next.handle).toHaveBeenCalledTimes(2);
    expect(logger.debug).not.toHaveBeenCalledWith(
      expect.anything(),
      "Caching fresh response"
    );
  });
});

import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { firstValueFrom, of, throwError } from "rxjs";
import type { ConfigService, ConfigStore, EddieConfig } from "@eddie/config";
import type { Logger } from "pino";
import { RequestLoggingInterceptor } from "../../../src/logging.interceptor";

const createExecutionContext = (
  request: Partial<Request>,
  response: Partial<Response>
): ExecutionContext =>
  ({
    getType: () => "http",
    switchToHttp: () => ({
      getRequest: () => request as Request,
      getResponse: () => response as Response,
    }),
  }) as unknown as ExecutionContext;

describe("RequestLoggingInterceptor", () => {
  const originalHrtime = process.hrtime.bigint;
  const createConfig = (logLevel: string): EddieConfig =>
    ({
      logLevel,
      context: {
        baseDir: process.cwd(),
        includes: [],
        excludes: [],
        variables: {},
        maxFiles: 0,
        maxBytes: 0,
      },
    } as unknown as EddieConfig);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (process.hrtime as unknown as { bigint: () => bigint }).bigint = originalHrtime;
  });

  it("logs successful requests without bodies by default", async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), error: vi.fn() };
    const configService = {
      load: vi.fn(),
    } as unknown as ConfigService;
    const store = {
      getSnapshot: vi.fn(() => createConfig("info")),
      changes$: of(createConfig("info")),
    } as unknown as ConfigStore;
    const interceptor = new RequestLoggingInterceptor(
      configService,
      store,
      logger as unknown as Logger
    );
    await interceptor.onModuleInit();

    (process.hrtime as unknown as { bigint: () => bigint }).bigint = vi
      .fn()
      .mockReturnValueOnce(0n)
      .mockReturnValueOnce(2_500_000n);

    const request = {
      method: "GET",
      originalUrl: "/health",
      get: vi.fn(() => "agent"),
      body: { example: true },
    } as unknown as Request;
    const response = {
      statusCode: 200,
    } as unknown as Response;
    const context = createExecutionContext(request, response);
    const next: CallHandler = { handle: vi.fn(() => of({ status: "ok" })) };

    const result = await firstValueFrom(
      interceptor.intercept(context, next)
    );

    expect(result).toEqual({ status: "ok" });
    expect(logger.debug).toHaveBeenCalledWith(
      {
        method: "GET",
        url: "/health",
        userAgent: "agent",
        body: undefined,
      },
      "Handling incoming request"
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 200,
        durationMs: 2.5,
        response: undefined,
      }),
      "Request completed successfully"
    );
    expect(configService.load).not.toHaveBeenCalled();
  });

  it("logs request pipeline errors", async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), error: vi.fn() };
    const configService = {
      load: vi.fn(),
    } as unknown as ConfigService;
    const store = {
      getSnapshot: vi.fn(() => createConfig("debug")),
      changes$: of(createConfig("debug")),
    } as unknown as ConfigStore;
    const interceptor = new RequestLoggingInterceptor(
      configService,
      store,
      logger as unknown as Logger
    );
    await interceptor.onModuleInit();

    (process.hrtime as unknown as { bigint: () => bigint }).bigint = vi
      .fn()
      .mockReturnValueOnce(0n)
      .mockReturnValueOnce(1_000_000n);

    const request = {
      method: "POST",
      url: "/tasks",
      body: { task: "demo" },
      get: vi.fn(() => undefined),
    } as unknown as Request;
    const response = {
      statusCode: 500,
    } as unknown as Response;
    const context = createExecutionContext(request, response);
    const next: CallHandler = {
      handle: vi.fn(() => throwError(() => new Error("failed"))),
    };

    await expect(
      firstValueFrom(interceptor.intercept(context, next))
    ).rejects.toThrow("failed");

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: "/tasks",
        body: request.body,
        statusCode: 500,
      }),
      "Request pipeline emitted an error"
    );
    expect(configService.load).not.toHaveBeenCalled();
  });

  it("logs bodies on the first request when debug logging is enabled", async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), error: vi.fn() };
    const configService = {
      load: vi.fn(),
    } as unknown as ConfigService;
    const store = {
      getSnapshot: vi.fn(() => createConfig("debug")),
      changes$: of(createConfig("debug")),
    } as unknown as ConfigStore;
    const interceptor = new RequestLoggingInterceptor(
      configService,
      store,
      logger as unknown as Logger
    );

    (process.hrtime as unknown as { bigint: () => bigint }).bigint = vi
      .fn()
      .mockReturnValueOnce(0n)
      .mockReturnValueOnce(1_000_000n);

    const requestBody = { example: true };
    const request = {
      method: "POST",
      originalUrl: "/debug", // ensure originalUrl is preferred when present
      url: "/debug",
      get: vi.fn(() => "agent"),
      body: requestBody,
    } as unknown as Request;
    const response = { statusCode: 201 } as unknown as Response;
    const context = createExecutionContext(request, response);
    const next: CallHandler = { handle: vi.fn(() => of({ status: "created" })) };

    const result = await firstValueFrom(interceptor.intercept(context, next));

    expect(result).toEqual({ status: "created" });
    expect(logger.debug).toHaveBeenCalledWith(
      {
        method: "POST",
        url: "/debug",
        userAgent: "agent",
        body: requestBody,
      },
      "Handling incoming request"
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        response: { status: "created" },
        body: requestBody,
      }),
      "Request completed successfully"
    );
    expect(configService.load).not.toHaveBeenCalled();
  });
});

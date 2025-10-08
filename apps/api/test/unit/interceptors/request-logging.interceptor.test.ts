import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { firstValueFrom, of, throwError } from "rxjs";
import type { ConfigService, EddieConfig } from "@eddie/config";
import { LoggerService } from "@eddie/io";
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
    const loggerService = {
      getLogger: vi.fn(() => logger),
    } as unknown as LoggerService;
    const configService = {
      load: vi.fn().mockResolvedValue(createConfig("info")),
    } as unknown as ConfigService;
    const interceptor = new RequestLoggingInterceptor(
      configService,
      loggerService
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
    expect(loggerService.getLogger).toHaveBeenCalledWith("api:requests");
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
  });

  it("logs request pipeline errors", async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), error: vi.fn() };
    const loggerService = {
      getLogger: vi.fn(() => logger),
    } as unknown as LoggerService;
    const configService = {
      load: vi.fn().mockResolvedValue(createConfig("debug")),
    } as unknown as ConfigService;
    const interceptor = new RequestLoggingInterceptor(
      configService,
      loggerService
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
  });
});

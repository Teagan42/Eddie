import type { ArgumentsHost } from "@nestjs/common";
import { BadRequestException } from "@nestjs/common";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { ConfigService, EddieConfig } from "@eddie/config";
import { ContextService } from "@eddie/context";
import type { Logger } from "pino";
import { ApiHttpExceptionFilter } from "../../../src/http-exception.filter";

describe("ApiHttpExceptionFilter", () => {
  const baseConfig = {
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
      telemetry: { exposeErrorStack: false },
    },
  } as unknown as EddieConfig;

  const createHost = (request: Partial<Request>, response: Partial<Response>) => ({
    getType: () => "http",
    switchToHttp: () => ({
      getResponse: () => response as Response,
      getRequest: () => request as Request,
    }),
  }) as unknown as ArgumentsHost;

  it("formats http exceptions and logs them", async () => {
    const logger = { error: vi.fn(), debug: vi.fn() };
    const configService = {
      load: vi.fn().mockResolvedValue(baseConfig),
    } as unknown as ConfigService;
    const contextService = {
      pack: vi.fn().mockResolvedValue({ files: ["a"], totalBytes: 1024 }),
    } as unknown as ContextService;
    const filter = new ApiHttpExceptionFilter(
      configService,
      contextService,
      logger as unknown as Logger
    );

    await filter.onModuleInit();

    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const request = {
      method: "GET",
      originalUrl: "/health",
    } as unknown as Request;
    const host = createHost(request, response);
    const exception = new BadRequestException({
      message: "Invalid payload",
      details: { field: "name" },
    });

    await filter.catch(exception, host);

    expect(configService.load).toHaveBeenCalled();
    expect(contextService.pack).toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        path: "/health",
        message: "Invalid payload",
        details: expect.objectContaining({
          details: { field: "name" },
        }),
        context: { files: 1, totalBytes: 1024 },
      })
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, path: "/health" }),
      "Unhandled exception while processing request"
    );
  });

  it("includes stack traces when configured", async () => {
    const config = {
      ...baseConfig,
      api: {
        telemetry: { exposeErrorStack: true },
      },
    } as unknown as EddieConfig;
    const logger = { error: vi.fn(), debug: vi.fn() };
    const configService = {
      load: vi.fn().mockResolvedValue(config),
    } as unknown as ConfigService;
    const contextService = {
      pack: vi.fn().mockResolvedValue({ files: [], totalBytes: 0 }),
    } as unknown as ContextService;
    const filter = new ApiHttpExceptionFilter(
      configService,
      contextService,
      logger as unknown as Logger
    );

    await filter.onModuleInit();

    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const request = {
      method: "POST",
      url: "/ready",
    } as unknown as Request;
    const host = createHost(request, response);
    const error = new Error("boom");

    await filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: "Internal server error",
        stack: expect.arrayContaining([expect.stringContaining("Error: boom")]),
      })
    );
  });

  it("rethrows exceptions for non-http contexts", async () => {
    const logger = { error: vi.fn(), debug: vi.fn() };
    const configService = {
      load: vi.fn().mockResolvedValue(baseConfig),
    } as unknown as ConfigService;
    const contextService = {
      pack: vi.fn().mockResolvedValue({ files: [], totalBytes: 0 }),
    } as unknown as ContextService;
    const filter = new ApiHttpExceptionFilter(
      configService,
      contextService,
      logger as unknown as Logger
    );

    await expect(
      filter.catch(new Error("oops"), {
        getType: () => "rpc",
      } as unknown as ArgumentsHost)
    ).rejects.toThrow("oops");
  });
});

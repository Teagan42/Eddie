import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigService, EddieConfig } from "@eddie/config";
import { ContextService } from "@eddie/context";
import { LoggerService } from "@eddie/io";
import type { Reflector } from "@nestjs/core";
import { ApiKeyGuard } from "../../../src/auth/api-key.guard";

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

describe("ApiKeyGuard", () => {
  const baseConfig = {
    logLevel: "info",
    context: {
      baseDir: process.cwd(),
      includes: [],
      excludes: [],
      variables: { apiKeys: ["ctx-key"] },
      maxFiles: 0,
      maxBytes: 0,
    },
    api: {
      auth: {
        enabled: true,
        apiKeys: ["config-key"],
      },
    },
  } as unknown as EddieConfig;

  const previousKeys = process.env.EDDIE_API_KEYS;
  const previousKey = process.env.EDDIE_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.EDDIE_API_KEYS;
    delete process.env.EDDIE_API_KEY;
  });

  afterAll(() => {
    process.env.EDDIE_API_KEYS = previousKeys;
    process.env.EDDIE_API_KEY = previousKey;
  });

  const createGuard = async (config: EddieConfig, reflector?: Reflector) => {
    const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
    const loggerService = {
      getLogger: vi.fn(() => logger),
    } as unknown as LoggerService;
    const configService = {
      load: vi.fn().mockResolvedValue(config),
    } as unknown as ConfigService;
    const contextService = {
      pack: vi.fn().mockResolvedValue({ files: [], totalBytes: 0 }),
    } as unknown as ContextService;
    const guard = new ApiKeyGuard(
      (reflector ?? { getAllAndOverride: vi.fn().mockReturnValue(false) }) as unknown as Reflector,
      configService,
      contextService,
      loggerService
    );
    await guard.onModuleInit();
    return { guard, logger, loggerService, configService, contextService };
  };

  it("allows all requests when authentication is disabled", async () => {
    const config = {
      ...baseConfig,
      api: { auth: { enabled: false } },
    } as unknown as EddieConfig;
    const { guard } = await createGuard(config);

    await expect(guard.canActivate(createExecutionContext({}))).resolves.toBe(true);
  });

  it("bypasses authentication for public routes", async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const { guard, loggerService } = await createGuard(baseConfig, reflector);

    await expect(guard.canActivate(createExecutionContext({}))).resolves.toBe(true);
    expect(loggerService.getLogger).toHaveBeenCalledWith("api:auth");
  });

  it("accepts requests presenting a configured api key", async () => {
    const { guard } = await createGuard(baseConfig);

    const request = {
      method: "GET",
      originalUrl: "/secure",
      headers: { "x-api-key": "config-key" },
      get: vi.fn((header: string) => (header === "x-api-key" ? "config-key" : undefined)),
      query: {},
    } as unknown as Request;

    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);
  });

  it("rejects unauthenticated requests and logs the attempt", async () => {
    const { guard, logger } = await createGuard(baseConfig);

    const request = {
      method: "POST",
      originalUrl: "/secure",
      get: vi.fn(() => undefined),
      query: {},
    } as unknown as Request;

    await expect(
      guard.canActivate(createExecutionContext(request))
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/secure", method: "POST", presented: false }),
      "Rejected unauthenticated request"
    );
  });
});

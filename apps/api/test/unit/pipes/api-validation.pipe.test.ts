import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { Type } from "class-transformer";
import { IsInt } from "class-validator";
import type { ConfigService, EddieConfig } from "@eddie/config";
import { LoggerService } from "@eddie/io";
import { ApiValidationPipe } from "../../../src/validation.pipe";

describe("ApiValidationPipe", () => {
  const createConfig = (
    overrides: Partial<EddieConfig["api"]["validation"]> = {}
  ): EddieConfig =>
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
        validation: {
          whitelist: true,
          forbidNonWhitelisted: false,
          transform: true,
          enableImplicitConversion: true,
          ...overrides,
        },
      },
    } as unknown as EddieConfig);

  it("transforms and validates payloads using configuration defaults", async () => {
    class SampleDto {
      @Type(() => Number)
      @IsInt()
      count!: number;
    }

    const logger = { warn: vi.fn() };
    const loggerService = {
      getLogger: vi.fn(() => logger),
    } as unknown as LoggerService;
    const config = createConfig();
    const configService = {
      load: vi.fn().mockResolvedValue(config),
    } as unknown as ConfigService;
    const pipe = new ApiValidationPipe(configService, loggerService);

    await pipe.onModuleInit();

    const result = await pipe.transform(
      { count: "4" },
      { type: "body", metatype: SampleDto, data: undefined }
    );

    expect(result).toEqual({ count: 4 });
    expect(configService.load).toHaveBeenCalled();
    expect(loggerService.getLogger).toHaveBeenCalledWith("api:validation");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs validation failures and throws a bad request exception", async () => {
    class SampleDto {
      @Type(() => Number)
      @IsInt()
      count!: number;
    }

    const logger = { warn: vi.fn() };
    const loggerService = {
      getLogger: vi.fn(() => logger),
    } as unknown as LoggerService;
    const config = createConfig();
    const configService = {
      load: vi.fn().mockResolvedValue(config),
    } as unknown as ConfigService;
    const pipe = new ApiValidationPipe(configService, loggerService);

    await pipe.onModuleInit();

    await expect(
      pipe.transform(
        { count: "oops" },
        { type: "body", metatype: SampleDto, data: "count" }
      )
    ).rejects.toBeInstanceOf(BadRequestException);

    const [firstCall, secondCall] = logger.warn.mock.calls;
    expect(firstCall).toEqual([
      {
        errors: [
          {
            property: "count",
            constraints: expect.objectContaining({ isInt: expect.any(String) }),
          },
        ],
      },
      "Request validation failed",
    ]);
    expect(secondCall[1]).toBe("Validation pipeline rejected request");
  });
});

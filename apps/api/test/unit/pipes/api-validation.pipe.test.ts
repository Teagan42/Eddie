import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { Type } from "class-transformer";
import { IsInt } from "class-validator";
import type { ConfigService, ConfigStore, EddieConfig } from "@eddie/config";
import type { Logger } from "pino";
import { ApiValidationPipe } from "../../../src/validation.pipe";
import { of } from "rxjs";

describe("ApiValidationPipe", () => {
  const createConfig = (
    overrides: Partial<EddieConfig["api"]["validation"]> = {}
  ): EddieConfig =>
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
    const config = createConfig();
    const configService = {
      load: vi.fn(),
    } as unknown as ConfigService;
    const store = {
      getSnapshot: vi.fn(() => config),
      changes$: of(config),
    } as unknown as ConfigStore;
    const pipe = new ApiValidationPipe(
      configService,
      store,
      logger as unknown as Logger
    );

    await pipe.onModuleInit();

    const result = await pipe.transform(
      { count: "4" },
      { type: "body", metatype: SampleDto, data: undefined }
    );

    expect(result).toEqual({ count: 4 });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(configService.load).not.toHaveBeenCalled();
  });

  it("logs validation failures and throws a bad request exception", async () => {
    class SampleDto {
      @Type(() => Number)
      @IsInt()
      count!: number;
    }

    const logger = { warn: vi.fn() };
    const config = createConfig();
    const configService = {
      load: vi.fn(),
    } as unknown as ConfigService;
    const store = {
      getSnapshot: vi.fn(() => config),
      changes$: of(config),
    } as unknown as ConfigStore;
    const pipe = new ApiValidationPipe(
      configService,
      store,
      logger as unknown as Logger
    );

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
    expect(configService.load).not.toHaveBeenCalled();
  });
});

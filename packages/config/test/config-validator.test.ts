import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../src/defaults";
import { ConfigValidator, ConfigValidationError } from "../src/validation/config-validator";
import type { EddieConfig } from "../src/types";

describe("ConfigValidator", () => {
  it("aggregates validation issues with a summary", () => {
    const validator = new ConfigValidator();

    const invalidConfig: EddieConfig = {
      ...DEFAULT_CONFIG,
      projectDir: " ",
      context: {
        ...DEFAULT_CONFIG.context,
        resources: [
          {
            type: "bundle",
            id: "",
            include: "not-array" as any,
          },
        ],
      } as any,
      tools: {
        ...DEFAULT_CONFIG.tools!,
        sources: "not-array" as any,
      } as any,
      providers: {
        invalid: {
          provider: {} as any,
          model: " ",
        },
      },
    };

    expect(() => validator.validate(invalidConfig)).toThrowError(
      ConfigValidationError,
    );

    try {
      validator.validate(invalidConfig);
    } catch (error) {
      const validationError = error as ConfigValidationError;
      expect(validationError.summary).toMatch(/failed with/i);
      expect(validationError.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "projectDir",
            message: expect.stringContaining("non-empty string"),
          }),
          expect.objectContaining({
            path: "tools.sources",
            message: expect.stringContaining("array"),
          }),
          expect.objectContaining({
            path: "providers.invalid.provider.name",
            message: expect.stringContaining("non-empty string"),
          }),
          expect.objectContaining({
            path: "providers.invalid.model",
            message: expect.stringContaining("non-empty string"),
          }),
          expect.objectContaining({
            path: "context.resources[0].id",
            message: expect.stringContaining("non-empty string"),
          }),
        ]),
      );
      return;
    }

    throw new Error("Expected ConfigValidator to throw ConfigValidationError");
  });
});

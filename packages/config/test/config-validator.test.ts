import { describe, expect, it } from "vitest";

import { ConfigValidator } from "../src/validation/config-validator";
import { DEFAULT_CONFIG } from "../src/defaults";
import type { EddieConfig } from "../src/types";

describe("ConfigValidator", () => {
  const createValidator = () => new ConfigValidator();

  it("aggregates validation errors when multiple issues are present", () => {
    const invalidConfig: EddieConfig = {
      ...structuredClone(DEFAULT_CONFIG),
      projectDir: "",
      tools: {
        sources: [
          {
            id: "",
            type: "http",
            url: "",
          },
        ],
      },
    };

    const validator = createValidator();

    expect(() => validator.validate(invalidConfig)).toThrowError(AggregateError);

    try {
      validator.validate(invalidConfig);
    } catch (error) {
      const aggregate = error as AggregateError;
      expect(Array.isArray(aggregate.errors)).toBe(true);
      expect(aggregate.errors).toHaveLength(2);
      expect(aggregate.message).toContain(
        "projectDir must be a non-empty string.",
      );
      expect(aggregate.message).toContain(
        "tools.sources[0].type must be the literal string \"mcp\".",
      );
    }
  });

  it("passes validation when configuration matches defaults", () => {
    const validator = createValidator();
    const validConfig = structuredClone(DEFAULT_CONFIG) as EddieConfig;

    expect(() => validator.validate(validConfig)).not.toThrow();
  });
});

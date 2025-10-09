import { describe, expect, it } from "vitest";
import {
  EDDIE_CONFIG_INPUT_SCHEMA_ID,
  EDDIE_CONFIG_SCHEMA,
  EDDIE_CONFIG_SCHEMA_BUNDLE,
  EDDIE_CONFIG_SCHEMA_ID,
} from "../src/schema";

describe("EDDIE_CONFIG_SCHEMA_BUNDLE", () => {
  it("exposes the schema identifiers and version", () => {
    expect(EDDIE_CONFIG_SCHEMA_BUNDLE).toMatchObject({
      id: EDDIE_CONFIG_SCHEMA_ID,
      version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
    });
  });

  it("references the canonical schema exports", () => {
    expect(EDDIE_CONFIG_SCHEMA_BUNDLE.schema).toBe(EDDIE_CONFIG_SCHEMA);
    expect(EDDIE_CONFIG_SCHEMA_BUNDLE.schema.$id).toBe(EDDIE_CONFIG_SCHEMA_ID);
    expect(EDDIE_CONFIG_SCHEMA_BUNDLE.schema.$schema).toBe(
      "http://json-schema.org/draft-07/schema#",
    );

    expect(EDDIE_CONFIG_SCHEMA_BUNDLE.inputSchema.$id).toBe(
      EDDIE_CONFIG_INPUT_SCHEMA_ID,
    );
  });

  it("documents the major configuration sections", () => {
    const schemaProperties =
      EDDIE_CONFIG_SCHEMA_BUNDLE.schema.properties ?? {};

    expect(schemaProperties).toHaveProperty("provider");
    expect(schemaProperties).toHaveProperty("providers");
    expect(schemaProperties).toHaveProperty("context");
    expect(schemaProperties).toHaveProperty("logging");
    expect(schemaProperties).toHaveProperty("tools");
    expect(schemaProperties).toHaveProperty("hooks");
    expect(schemaProperties).toHaveProperty("agents");
  });

  it("disables additional properties at the top level", () => {
    expect(EDDIE_CONFIG_SCHEMA_BUNDLE.schema.additionalProperties).toBe(false);
    expect(EDDIE_CONFIG_SCHEMA_BUNDLE.inputSchema.additionalProperties).toBe(false);
  });
});

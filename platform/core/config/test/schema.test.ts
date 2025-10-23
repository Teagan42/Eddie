import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import {
  EDDIE_CONFIG_INPUT_SCHEMA_ID,
  EDDIE_CONFIG_SCHEMA,
  EDDIE_CONFIG_SCHEMA_BUNDLE,
  EDDIE_CONFIG_SCHEMA_ID,
} from "../src/schema";

function extractSchemaProperties(
  schema: unknown,
): Record<string, unknown> {
  if (!schema || typeof schema !== "object") {
    return {};
  }

  if (!("properties" in schema)) {
    return {};
  }

  const { properties } = schema as { properties?: Record<string, unknown> };
  return properties ?? {};
}

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
    expect(schemaProperties).toHaveProperty("memory");
    expect(schemaProperties).toHaveProperty("demoSeeds");
  });

  it("describes the demo seed file locations", () => {
    const schemaProperties =
      EDDIE_CONFIG_SCHEMA_BUNDLE.schema.properties ?? {};
    const inputProperties =
      EDDIE_CONFIG_SCHEMA_BUNDLE.inputSchema.properties ?? {};

    expect(schemaProperties.demoSeeds).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {
        chatSessions: { type: "string" },
        agentInvocations: { type: "string" },
        traces: { type: "string" },
        logs: { type: "string" },
        runtimeConfig: { type: "string" },
      },
    });

    expect(inputProperties.demoSeeds).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
  });

  it("describes the configuration version field", () => {
    const schemaProperties =
      EDDIE_CONFIG_SCHEMA_BUNDLE.schema.properties ?? {};
    const inputProperties =
      EDDIE_CONFIG_SCHEMA_BUNDLE.inputSchema.properties ?? {};

    expect(schemaProperties).toHaveProperty("version");
    expect(schemaProperties.version).toMatchObject({ type: "integer" });
    expect(inputProperties).toHaveProperty("version");
  });

  it("documents API demo seed configuration", () => {
    const apiSchema = EDDIE_CONFIG_SCHEMA_BUNDLE.schema.properties?.api;
    const apiInputSchema =
      EDDIE_CONFIG_SCHEMA_BUNDLE.inputSchema.properties?.api;

    expect(apiSchema).toBeDefined();
    expect(apiInputSchema).toBeDefined();

    const apiProperties = extractSchemaProperties(apiSchema);
    const apiInputProperties = extractSchemaProperties(apiInputSchema);

    expect(apiProperties).toHaveProperty("demoSeeds");
    expect(apiInputProperties).toHaveProperty("demoSeeds");

    expect(apiProperties?.demoSeeds).toMatchObject({
      type: "object",
      properties: {
        files: {
          type: "array",
          items: { type: "string", minLength: 1 },
          minItems: 1,
        },
      },
    });
  });

  it("disables additional properties at the top level", () => {
    expect(EDDIE_CONFIG_SCHEMA_BUNDLE.schema.additionalProperties).toBe(false);
    expect(EDDIE_CONFIG_SCHEMA_BUNDLE.inputSchema.additionalProperties).toBe(false);
  });

  it("documents the memory configuration surface", () => {
    const schemaProperties =
      EDDIE_CONFIG_SCHEMA_BUNDLE.schema.properties ?? {};
    const inputProperties =
      EDDIE_CONFIG_SCHEMA_BUNDLE.inputSchema.properties ?? {};

    expect(schemaProperties.memory).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        facets: {
          type: "object",
          additionalProperties: false,
          properties: {
            defaultStrategy: { type: "string" },
          },
        },
        vectorStore: {
          type: "object",
          additionalProperties: false,
          properties: {
            provider: { type: "string" },
            qdrant: {
              type: "object",
              additionalProperties: false,
              properties: {
                url: { type: "string" },
                apiKey: { type: "string" },
                collection: { type: "string" },
                timeoutMs: { type: "integer", minimum: 0 },
              },
            },
          },
        },
      },
    });

    expect(inputProperties.memory).toMatchObject({
      type: "object",
      additionalProperties: false,
    });

    const agentsSchema = EDDIE_CONFIG_SCHEMA_BUNDLE.schema.properties?.agents;
    const agentsInputSchema =
      EDDIE_CONFIG_SCHEMA_BUNDLE.inputSchema.properties?.agents;

    expect(agentsSchema).toBeDefined();
    expect(agentsInputSchema).toBeDefined();

    const managerSchema = extractSchemaProperties(agentsSchema)?.manager;
    const managerInputSchema =
      extractSchemaProperties(agentsInputSchema)?.manager;

    expect(managerSchema).toBeDefined();
    expect(managerInputSchema).toBeDefined();

    expect(managerSchema).toHaveProperty("properties.memory");
    expect(managerInputSchema).toHaveProperty("properties.memory");

    const managerMemorySchema =
      extractSchemaProperties(managerSchema)?.memory;
    const managerMemoryInputSchema =
      extractSchemaProperties(managerInputSchema)?.memory;

    expect(managerMemorySchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {
        recall: { type: "boolean" },
        store: { type: "boolean" },
      },
    });
    expect(managerMemoryInputSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });

    const subagentsSchema = extractSchemaProperties(agentsSchema)?.subagents;
    const subagentsInputSchema =
      extractSchemaProperties(agentsInputSchema)?.subagents;

    expect(subagentsSchema).toHaveProperty("items");
    expect(subagentsInputSchema).toHaveProperty("items");

    const subagentSchema = extractSchemaProperties(subagentsSchema?.items);
    const subagentInputSchema = extractSchemaProperties(
      subagentsInputSchema?.items,
    );

    expect(subagentSchema).toHaveProperty("memory");
    expect(subagentInputSchema).toHaveProperty("memory");

    expect(subagentSchema?.memory).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {
        recall: { type: "boolean" },
        store: { type: "boolean" },
      },
    });
    expect(subagentInputSchema?.memory).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
  });

  it("keeps the generated JSON schema bundle in sync", () => {
    const schemaPath = new URL(
      "../../../../docs/generated/config-schema.json",
      import.meta.url,
    );
    const serialized = readFileSync(schemaPath, "utf8");
    const parsed = JSON.parse(serialized);

    expect(parsed).toEqual(EDDIE_CONFIG_SCHEMA_BUNDLE);
  });
});

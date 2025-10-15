import { describe, expect, it } from "vitest";
import { ToolRegistry } from "@eddie/tools";

const ctx = {
  cwd: process.cwd(),
  confirm: async () => true,
  env: process.env,
};

describe("ToolRegistry", () => {
  it("validates inputs and outputs against provided schemas", async () => {
    const registry = new ToolRegistry([
      {
        name: "echo",
        description: "Echo text",
        jsonSchema: {
          type: "object",
          properties: {
            text: { type: "string" },
          },
          required: ["text"],
          additionalProperties: false,
        },
        outputSchema: {
          $id: "test.registry.echo.result",
          type: "object",
          properties: {
            text: { type: "string" },
          },
          required: ["text"],
          additionalProperties: false,
        },
        async handler(args) {
          const text = String((args as { text: string }).text);
          return {
            schema: "test.registry.echo.result",
            content: text,
            data: { text },
          };
        },
      },
    ]);

    const result = await registry.execute(
      { name: "echo", arguments: { text: "hello" } },
      ctx,
    );

    expect(result).toMatchObject({
      schema: "test.registry.echo.result",
      content: "hello",
      data: { text: "hello" },
    });

    await expect(
      registry.execute({ name: "echo", arguments: {} }, ctx),
    ).rejects.toThrow(/Validation failed/);
  });

  it("throws when the tool output violates the declared schema", async () => {
    const registry = new ToolRegistry([
      {
        name: "broken",
        description: "Broken tool",
        jsonSchema: {
          type: "object",
        },
        outputSchema: {
          $id: "test.registry.broken.result",
          type: "object",
          properties: {
            value: { type: "number" },
          },
          required: ["value"],
          additionalProperties: false,
        },
        async handler() {
          return {
            schema: "test.registry.broken.result",
            content: "bad",
            data: { value: "not-a-number" as unknown as number },
          };
        },
      },
    ]);

    await expect(
      registry.execute({ name: "broken", arguments: {} }, ctx),
    ).rejects.toThrow(/Output validation failed/);
  });

  it("generates a discriminator id when the output schema omits one", async () => {
    let generatedId: string | undefined;

    const registry = new ToolRegistry([
      {
        name: "missing",
        description: "missing id",
        jsonSchema: { type: "object" },
        // @ts-expect-error intentionally omit $id to assert runtime guard
        outputSchema: {
          type: "object",
          additionalProperties: false,
        },
        async handler() {
          if (!generatedId) {
            throw new Error("expected schema id to be generated before execution");
          }

          return {
            schema: generatedId,
            content: "",
            data: {},
          };
        },
      },
    ]);

    const tool = registry.get("missing");
    expect(tool?.expectedSchemaId).toBeTruthy();
    generatedId = tool?.expectedSchemaId;
    expect(generatedId).toBeDefined();

    const schema = tool?.outputSchema as { $id?: string; id?: string } | undefined;
    expect(schema?.$id).toBe(generatedId);
    expect(schema?.id).toBe(generatedId);

    await expect(
      registry.execute({ name: "missing", arguments: {} }, ctx),
    ).resolves.toMatchObject({ schema: generatedId, content: "", data: {} });
  });

  it("reuses compiled validators when tools share an output schema", async () => {
    const sharedSchema = {
      $id: "test.registry.shared.result",
      type: "object",
      properties: {
        value: { type: "string" },
      },
      required: ["value"],
      additionalProperties: false,
    } as const;

    const registry = new ToolRegistry([
      {
        name: "first",
        jsonSchema: { type: "object" },
        outputSchema: sharedSchema,
        async handler() {
          return { schema: sharedSchema.$id, content: "first", data: { value: "one" } };
        },
      },
      {
        name: "second",
        jsonSchema: { type: "object" },
        outputSchema: sharedSchema,
        async handler() {
          return { schema: sharedSchema.$id, content: "second", data: { value: "two" } };
        },
      },
    ]);

    await expect(
      registry.execute({ name: "first", arguments: {} }, ctx),
    ).resolves.toMatchObject({ schema: sharedSchema.$id, content: "first" });
    await expect(
      registry.execute({ name: "second", arguments: {} }, ctx),
    ).resolves.toMatchObject({ schema: sharedSchema.$id, content: "second" });
  });

  it("fails when structured data is omitted despite declaring a schema", async () => {
    const registry = new ToolRegistry([
      {
        name: "nodata",
        description: "missing data",
        jsonSchema: {
          type: "object",
        },
        outputSchema: {
          $id: "test.registry.nodata.result",
          type: "object",
          properties: {
            value: { type: "string" },
          },
          required: ["value"],
          additionalProperties: false,
        },
        async handler() {
          return {
            schema: "test.registry.nodata.result",
            content: "",
            // intentionally omit data
          };
        },
      },
    ]);

    await expect(
      registry.execute({ name: "nodata", arguments: {} }, ctx),
    ).rejects.toThrow(/structured data missing/);
  });
});

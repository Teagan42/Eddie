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

  it("requires output schemas to provide a discriminator id", () => {
    expect(
      () =>
        new ToolRegistry([
          {
            name: "missing",
            description: "missing id",
            jsonSchema: { type: "object" },
            // @ts-expect-error intentionally omit $id to assert runtime guard
            outputSchema: {
              type: "object",
            },
            async handler() {
              return {
                schema: "missing",
                content: "",
              };
            },
          },
        ]),
    ).toThrow(/output schema must declare a string \$id/);
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

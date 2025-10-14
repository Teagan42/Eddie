import { describe, expect, it, expectTypeOf } from "vitest";
import type { StreamOptions, ToolSchema } from "@eddie/types";
import { resolveResponseFormat } from "../src/response-format";

describe("resolveResponseFormat", () => {
  it("returns tool output schema when response format unspecified", () => {
    const spawnTool: ToolSchema = {
      type: "function",
      name: "spawn_subagent",
      parameters: { type: "object" },
      outputSchema: {
        type: "json_schema",
        name: "eddie.tool.spawn_subagent.result.v1",
        strict: true,
        schema: { type: "object" },
      },
    };

    const options: StreamOptions = {
      model: "gpt-test",
      messages: [],
      tools: [spawnTool],
    };

    const format = resolveResponseFormat(options);

    expect(format).toEqual(spawnTool.outputSchema);
    expectTypeOf(format).toMatchTypeOf<Record<string, unknown> | undefined>();
  });
});

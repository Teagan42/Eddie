import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { TypeScriptToolSourceConfig } from "@eddie/types";
import { TypescriptToolSourceService } from "../src/typescript-tool-source.service";

const TOOL_DEFINITION = `export const tools = [
  {
    name: "local_tool",
    description: "Local tool",
    jsonSchema: { type: "object", additionalProperties: false },
    handler: async () => ({ schema: "text", content: "local" })
  }
];
`;

describe("TypescriptToolSourceService", () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "eddie-tools-"));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it("loads tool definitions from configured TypeScript files", async () => {
    const filePath = path.join(workspace, `${randomUUID()}.tool.ts`);
    await writeFile(filePath, TOOL_DEFINITION, "utf8");

    const source: TypeScriptToolSourceConfig = {
      id: "local",
      type: "typescript",
      files: [path.relative(workspace, filePath)],
      exportName: "tools",
    };

    const service = new TypescriptToolSourceService();
    const tools = await service.collectTools([source], { projectDir: workspace });

    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("local_tool");
    expect(typeof tools[0]?.handler).toBe("function");
  });
});

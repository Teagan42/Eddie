import fs from "fs/promises";
import path from "path";
import type { ToolDefinition } from "../../types";

export const fileWriteTool: ToolDefinition = {
  name: "file_write",
  description: "Write UTF-8 text content to a file relative to the workspace.",
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", minLength: 1 },
      content: { type: "string" },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
  outputSchema: {
    $id: "eddie.tool.file_write.result.v1",
    type: "object",
    properties: {
      path: { type: "string" },
      bytesWritten: { type: "number" },
    },
    required: ["path", "bytesWritten"],
    additionalProperties: false,
  },
  async handler(args, ctx) {
    const relPath = String(args.path ?? "");
    const content = String(args.content ?? "");
    const approved = await ctx.confirm(`Write file: ${relPath}`);
    if (!approved) {
      return {
        schema: "eddie.tool.file_write.result.v1",
        content: "Write cancelled by user.",
        data: {
          path: relPath,
          bytesWritten: 0,
        },
      };
    }

    const absolute = path.resolve(ctx.cwd, relPath);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, content, "utf-8");
    return {
      schema: "eddie.tool.file_write.result.v1",
      content: `Wrote ${relPath}`,
      data: {
        path: relPath,
        bytesWritten: Buffer.byteLength(content, "utf-8"),
      },
    };
  },
};


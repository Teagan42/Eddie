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
  async handler(args, ctx) {
    const relPath = String(args.path ?? "");
    const content = String(args.content ?? "");
    const approved = await ctx.confirm(`Write file: ${relPath}`);
    if (!approved) {
      return { content: "Write cancelled by user." };
    }

    const absolute = path.resolve(ctx.cwd, relPath);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, content, "utf-8");
    return { content: `Wrote ${relPath}` };
  },
};


import fs from "fs/promises";
import path from "path";
import type { ToolDefinition } from "../../types";

export const fileReadTool: ToolDefinition = {
  name: "file_read",
  description: "Read UTF-8 text content from a file relative to the workspace.",
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", minLength: 1 },
      maxBytes: { type: "number", minimum: 1 },
    },
    required: ["path"],
    additionalProperties: false,
  },
  async handler(args, ctx) {
    const relPath = String(args.path ?? "");
    const absolute = path.resolve(ctx.cwd, relPath);
    const content = await fs.readFile(absolute, "utf-8");
    const maxBytes = args.maxBytes ? Number(args.maxBytes) : undefined;
    const slice =
      maxBytes && Buffer.byteLength(content) > maxBytes
        ? content.slice(0, maxBytes)
        : content;
    return { content: slice };
  },
};


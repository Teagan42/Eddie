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
  outputSchema: {
    $id: "eddie.tool.file_read.result.v1",
    type: "object",
    properties: {
      path: { type: "string" },
      bytes: { type: "number" },
      truncated: { type: "boolean" },
    },
    required: ["path", "bytes", "truncated"],
    additionalProperties: false,
  },
  async handler(args, ctx) {
    const relPath = String(args.path ?? "");
    const absolute = path.resolve(ctx.cwd, relPath);
    const content = await fs.readFile(absolute, "utf-8");
    const maxBytes = args.maxBytes ? Number(args.maxBytes) : undefined;
    const originalBytes = Buffer.byteLength(content, "utf-8");
    const slice =
      maxBytes && originalBytes > maxBytes
        ? content.slice(0, maxBytes)
        : content;
    const truncated = Boolean(maxBytes && originalBytes > maxBytes);
    return {
      schema: "eddie.tool.file_read.result.v1",
      content: slice,
      data: {
        path: relPath,
        bytes: Buffer.byteLength(slice, "utf-8"),
        truncated,
      },
    };
  },
};


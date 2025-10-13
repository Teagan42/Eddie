import fs from "fs/promises";
import path from "path";
import type { ToolDefinition } from "@eddie/types";

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
    const fileBuffer = await fs.readFile(absolute);
    const maxBytes = args.maxBytes ? Number(args.maxBytes) : undefined;
    const shouldTruncate =
      typeof maxBytes === "number" && fileBuffer.byteLength > maxBytes;
    const truncatedBuffer = shouldTruncate
      ? fileBuffer.subarray(0, maxBytes)
      : fileBuffer;
    const content = truncatedBuffer.toString("utf-8");
    const outputBytes = truncatedBuffer.byteLength;
    return {
      schema: "eddie.tool.file_read.result.v1",
      content,
      data: {
        path: relPath,
        bytes: outputBytes,
        truncated: shouldTruncate,
      },
    };
  },
};


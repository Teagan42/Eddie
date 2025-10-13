import fs from "fs/promises";
import path from "path";
import type { ToolDefinition } from "@eddie/types";

const isContinuationByte = (byte: number): boolean =>
  (byte & 0b1100_0000) === 0b1000_0000;

const expectedSequenceLength = (leadByte: number): number => {
  if ((leadByte & 0b1111_1000) === 0b1111_0000) {
    return 4;
  }

  if ((leadByte & 0b1111_0000) === 0b1110_0000) {
    return 3;
  }

  if ((leadByte & 0b1110_0000) === 0b1100_0000) {
    return 2;
  }

  return 1;
};

const trimToUtf8Boundary = (buffer: Buffer): Buffer => {
  const length = buffer.byteLength;
  if (length === 0) {
    return buffer;
  }

  let leadIndex = length - 1;
  while (leadIndex >= 0 && isContinuationByte(buffer[leadIndex])) {
    leadIndex -= 1;
  }

  if (leadIndex < 0) {
    return buffer.subarray(0, 0);
  }

  const expectedLength = expectedSequenceLength(buffer[leadIndex]);
  const actualLength = length - leadIndex;
  if (actualLength < expectedLength) {
    return buffer.subarray(0, leadIndex);
  }

  return buffer;
};

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
      ? trimToUtf8Boundary(fileBuffer.subarray(0, maxBytes))
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


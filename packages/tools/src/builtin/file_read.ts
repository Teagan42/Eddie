import fs from "fs/promises";
import path from "path";
import type { ToolDefinition } from "@eddie/types";

const UTF8_SAFETY_MARGIN = 4;

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

    const createResult = (buffer: Buffer, truncated: boolean) => ({
      schema: "eddie.tool.file_read.result.v1" as const,
      content: buffer.toString("utf-8"),
      data: {
        path: relPath,
        bytes: buffer.byteLength,
        truncated,
      },
    });

    const maxBytesValue =
      args.maxBytes !== undefined ? Number(args.maxBytes) : undefined;

    if (Number.isFinite(maxBytesValue)) {
      const maxBytes = Math.max(0, Math.floor(maxBytesValue as number));
      const fileHandle = await fs.open(absolute, "r");

      try {
        const stats = await fileHandle.stat();
        const maxReadable = Math.min(
          stats.size,
          maxBytes + UTF8_SAFETY_MARGIN,
        );

        let slice = Buffer.alloc(0);
        if (maxReadable > 0) {
          const buffer = Buffer.alloc(maxReadable);
          const { bytesRead } = await fileHandle.read(
            buffer,
            0,
            maxReadable,
            0,
          );
          slice = buffer.subarray(0, bytesRead);
        }

        const trimmed = trimToUtf8Boundary(slice);
        const limited = trimmed.subarray(0, Math.min(trimmed.length, maxBytes));
        return createResult(limited, stats.size > limited.byteLength);
      } finally {
        await fileHandle.close();
      }
    }

    const fileBuffer = await fs.readFile(absolute);
    return createResult(trimToUtf8Boundary(fileBuffer), false);
  },
};


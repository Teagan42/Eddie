import fs from "fs/promises";
import path from "path";
import type { ToolDefinition } from "@eddie/types";

const UTF8_SAFETY_MARGIN = 4;
const MAX_PAGE_BYTES = 20 * 1024;

const isContinuationByte = (byte: number): boolean =>
  (byte & 0b1100_0000) === 0b1000_0000;

const coercePositiveInteger = (value: unknown): number | undefined => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  return Math.max(1, Math.floor(numeric));
};

const clampPageSizedInteger = (value: unknown): number | undefined => {
  const positive = coercePositiveInteger(value);
  if (positive === undefined) {
    return undefined;
  }

  return Math.min(MAX_PAGE_BYTES, positive);
};

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
  while (leadIndex >= 0 && isContinuationByte(buffer[ leadIndex ])) {
    leadIndex -= 1;
  }

  if (leadIndex < 0) {
    return buffer.subarray(0, 0);
  }

  const expectedLength = expectedSequenceLength(buffer[ leadIndex ]);
  const actualLength = length - leadIndex;
  if (actualLength < expectedLength) {
    return buffer.subarray(0, leadIndex);
  }

  return buffer;
};

const alignOffsetToCodePoint = async (
  fileHandle: fs.FileHandle,
  offset: number,
): Promise<number> => {
  if (offset === 0) {
    return 0;
  }

  const lookBehind = Math.min(offset, UTF8_SAFETY_MARGIN);
  if (lookBehind === 0) {
    return offset;
  }

  const buffer = Buffer.alloc(lookBehind);
  const { bytesRead } = await fileHandle.read(
    buffer,
    0,
    lookBehind,
    offset - lookBehind,
  );

  if (bytesRead === 0) {
    return offset;
  }

  let leadIndex = bytesRead - 1;
  while (leadIndex >= 0 && isContinuationByte(buffer[ leadIndex ])) {
    leadIndex -= 1;
  }

  if (leadIndex < 0) {
    return offset - bytesRead;
  }

  const continuationCount = bytesRead - leadIndex;
  const sequenceLength = expectedSequenceLength(buffer[ leadIndex ]);
  if (sequenceLength > continuationCount) {
    return offset - continuationCount;
  }

  return offset;
};

export const fileReadTool: ToolDefinition = {
  name: "file_read",
  description: "Read UTF-8 text content from a file relative to the workspace.",
  jsonSchema: {
    type: "object",
    properties: {
      path: { type: "string", minLength: 1 },
      maxBytes: { type: "number", minimum: 1, maximum: 1000 },
      page: { type: "number", minimum: 1 },
      pageSize: { type: "number", minimum: 1, maximum: 1000 },
    },
    required: [ "path" ],
    additionalProperties: false,
  },
  outputSchema: {
    $id: "eddie.tool.file_read.result.v1",
    type: "object",
    properties: {
      path: { type: "string" },
      bytes: { type: "number" },
      truncated: { type: "boolean" },
      page: { type: "number" },
      pageSize: { type: "number" },
      totalBytes: { type: "number" },
      totalPages: { type: "number" },
    },
    required: [ "path", "bytes", "truncated", "page", "pageSize", "totalBytes", "totalPages" ],
    additionalProperties: false,
  },
  async handler(args, ctx) {
    const relPath = String(args.path ?? "");
    const absolute = path.resolve(ctx.cwd, relPath);

    const page = coercePositiveInteger(args.page) ?? 1;
    const pageSize =
      clampPageSizedInteger(args.pageSize) ??
      clampPageSizedInteger(args.maxBytes) ??
      MAX_PAGE_BYTES;

    const fileHandle = await fs.open(absolute, "r");

    try {
      const stats = await fileHandle.stat();
      const totalBytes = stats.size;
      const rawOffset = (page - 1) * pageSize;
      const offset = await alignOffsetToCodePoint(fileHandle, rawOffset);
      const remaining = Math.max(totalBytes - offset, 0);

      const maxReadable = Math.min(
        remaining,
        pageSize + UTF8_SAFETY_MARGIN,
      );

      let slice = Buffer.alloc(0);
      if (maxReadable > 0) {
        const buffer = Buffer.alloc(maxReadable);
        const { bytesRead } = await fileHandle.read(
          buffer,
          0,
          maxReadable,
          offset,
        );
        slice = buffer.subarray(0, bytesRead);
      }

      const trimmed = trimToUtf8Boundary(slice);
      let limited = trimmed;
      if (trimmed.length > pageSize) {
        limited = trimToUtf8Boundary(trimmed.subarray(0, pageSize));
      }

      const bytes = limited.byteLength;
      const nextOffset = offset + bytes;
      const truncated = nextOffset < totalBytes;
      const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(totalBytes / pageSize)) : 1;

      return {
        schema: "eddie.tool.file_read.result.v1" as const,
        content: limited.toString("utf-8"),
        data: {
          path: relPath,
          bytes,
          truncated,
          page,
          pageSize,
          totalBytes,
          totalPages,
        },
      };
    } finally {
      await fileHandle.close();
    }
  },
};


import util from "util";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolExecutionContext } from "@eddie/types";

const execInvocations: Array<{ command: string; options: Record<string, unknown> }> = [];

vi.mock("child_process", () => {
  const execMock = vi.fn((command: string, options: any, callback?: any) => {
    let resolvedOptions = options;
    let resolvedCallback = callback;

    if (typeof resolvedOptions === "function") {
      resolvedCallback = resolvedOptions;
      resolvedOptions = {};
    }

    execInvocations.push({ command, options: resolvedOptions ?? {} });
    resolvedCallback?.(null, "mock-stdout", "mock-stderr");
    return {} as any;
  });

  (execMock as any)[util.promisify.custom] = (
    command: string,
    options?: Record<string, unknown>,
  ) => {
    return new Promise((resolve, reject) => {
      execMock(command, options ?? {}, (error: unknown, stdout: string, stderr: string) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({ stdout, stderr });
      });
    });
  };

  return { exec: execMock };
});

const DEFAULT_MAX_STDIO_BYTES = 512_000;

// Import after mocking dependencies so the tool captures the mock implementations.
// eslint-disable-next-line import/first
import { bashTool } from "../src/builtin/bash";

describe("bash tool", () => {
  beforeEach(() => {
    execInvocations.length = 0;
  });

  it("respects cwd argument and clamps maxBytes", async () => {
    const ctx: ToolExecutionContext = {
      cwd: "/base/path",
      confirm: vi.fn(async () => true),
      env: process.env,
    };

    const result = await bashTool.handler(
      {
        command: "pwd",
        cwd: "/custom/path",
        timeoutMs: 5000,
        maxBytes: 1024,
      },
      ctx,
    );

    expect(execInvocations).toHaveLength(1);
    const invocation = execInvocations[0];
    expect(invocation.options.cwd).toBe("/custom/path");
    expect(invocation.options.timeout).toBe(5000);
    expect(invocation.options.maxBuffer).toBe(1024);

    expect(result.schema).toBe("eddie.tool.bash.result.v1");
    expect(result.data).toEqual({
      stdout: "mock-stdout",
      stderr: "mock-stderr",
    });
    expect(result.content).toBe("mock-stdout");
  });

  it("falls back to context cwd and maximum buffer when args omit overrides", async () => {
    const ctx: ToolExecutionContext = {
      cwd: "/base/path",
      confirm: vi.fn(async () => true),
      env: process.env,
    };

    await bashTool.handler(
      {
        command: "ls",
      },
      ctx,
    );

    expect(execInvocations).toHaveLength(1);
    const invocation = execInvocations[0];
    expect(invocation.options.cwd).toBe("/base/path");
    expect(invocation.options.maxBuffer).toBe(DEFAULT_MAX_STDIO_BYTES);
  });
});

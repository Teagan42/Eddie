import { exec } from "child_process";
import path from "path";
import util from "util";
import type { ToolDefinition } from "@eddie/types";

const execAsync = util.promisify(exec);
const DEFAULT_MAX_STDIO_BYTES = 512_000;

function normalizeOutput(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Buffer) {
    return value.toString("utf-8");
  }

  return "";
}

function isWithinWorkspace(workspaceRoot: string, candidate: string): boolean {
  const normalizedWorkspace = path.resolve(workspaceRoot);
  const normalizedCandidate = path.resolve(candidate);
  const relative = path.relative(normalizedWorkspace, normalizedCandidate);
  if (relative === "") {
    return true;
  }

  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

export const bashTool: ToolDefinition = {
  name: "bash",
  description: "Run a shell command securely in the project workspace.",
  jsonSchema: {
    type: "object",
    properties: {
      command: { type: "string", minLength: 1 },
      timeoutMs: { type: "number", minimum: 100, default: 15_000 },
      cwd: { type: "string", minLength: 1 },
      maxBytes: {
        type: "number",
        minimum: 1,
        maximum: DEFAULT_MAX_STDIO_BYTES,
        default: DEFAULT_MAX_STDIO_BYTES,
      },
    },
    required: ["command"],
    additionalProperties: false,
  },
  outputSchema: {
    $id: "eddie.tool.bash.result.v1",
    type: "object",
    properties: {
      stdout: { type: "string" },
      stderr: { type: "string" },
    },
    required: ["stdout", "stderr"],
    additionalProperties: false,
  },
  async handler(args, ctx) {
    const command = String(args.command ?? "");
    const timeoutMs = Number(args.timeoutMs ?? 15_000);
    const workspaceCwd = path.resolve(ctx.cwd);
    const cwdArg = typeof args.cwd === "string" && args.cwd.length > 0 ? args.cwd : undefined;
    const resolvedCwd = cwdArg ? path.resolve(workspaceCwd, cwdArg) : workspaceCwd;

    if (!isWithinWorkspace(workspaceCwd, resolvedCwd)) {
      throw new Error(`Requested cwd is outside the workspace: ${cwdArg}`);
    }

    const cwd = resolvedCwd;
    const maxBytesValue = Number(args.maxBytes);
    const maxBytes = Number.isFinite(maxBytesValue)
      ? Math.min(Math.max(1, Math.floor(maxBytesValue)), DEFAULT_MAX_STDIO_BYTES)
      : DEFAULT_MAX_STDIO_BYTES;
    const approved = await ctx.confirm(`Run command: ${command}`);
    if (!approved) {
      return {
        schema: "eddie.tool.bash.result.v1",
        content: "Command rejected by user.",
        data: {
          stdout: "",
          stderr: "Command rejected by user.",
        },
      };
    }

    const execResult = await execAsync(command, {
      cwd,
      timeout: timeoutMs,
      env: ctx.env,
      maxBuffer: maxBytes,
    });

    const stdoutValue =
      typeof execResult === "object" && execResult !== null && "stdout" in execResult
        ? (execResult as { stdout?: string | Buffer }).stdout
        : execResult;
    const stderrValue =
      typeof execResult === "object" && execResult !== null && "stderr" in execResult
        ? (execResult as { stderr?: string | Buffer }).stderr
        : undefined;

    const stdout = normalizeOutput(stdoutValue);
    const stderr = normalizeOutput(stderrValue);

    const output = stdout || stderr || "(no output)";
    return {
      schema: "eddie.tool.bash.result.v1",
      content: output,
      data: {
        stdout: stdout ?? "",
        stderr: stderr ?? "",
      },
    };
  },
};


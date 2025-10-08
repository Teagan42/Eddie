import { exec } from "child_process";
import util from "util";
import type { ToolDefinition } from "@eddie/types";

const execAsync = util.promisify(exec);

export const bashTool: ToolDefinition = {
  name: "bash",
  description: "Run a shell command securely in the project workspace.",
  jsonSchema: {
    type: "object",
    properties: {
      command: { type: "string", minLength: 1 },
      timeoutMs: { type: "number", minimum: 100, default: 15_000 },
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

    const { stdout, stderr } = await execAsync(command, {
      cwd: ctx.cwd,
      timeout: timeoutMs,
      env: ctx.env,
    });

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


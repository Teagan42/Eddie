import "reflect-metadata";
import { describe, it, expect, beforeAll } from "vitest";
import { CliParserService, CliParseError } from "../../src/cli/cli-parser.service";

describe("CliParserService", () => {
  let parser: CliParserService;

  beforeAll(async () => {
    parser = new CliParserService();
  });

  it("parses options, aliases, and repeated values", () => {
    const result = parser.parse([
      "ask",
      "--model",
      "gpt-4",
      "--tools",
      "bash",
      "--tools",
      "edit",
      "--disable-tools",
      "write",
      "-D",
      "exec",
      "-C",
      "context-dir",
      "prompt",
      "question",
    ]);

    expect(result).toEqual({
      command: "ask",
      options: {
        model: "gpt-4",
        tools: ["bash", "edit"],
        disabledTools: ["write", "exec"],
        context: "context-dir",
      },
      positionals: ["prompt", "question"],
    });
  });

  it("tracks boolean flags and preserves arguments after a terminator", () => {
    const result = parser.parse([
      "run",
      "--auto-approve",
      "--auto",
      "--non-interactive",
      "--no-context",
      "--",
      "--not-an-option",
      "file.txt",
    ]);

    expect(result).toEqual({
      command: "run",
      options: {
        autoApprove: true,
        nonInteractive: true,
        disableContext: true,
      },
      positionals: ["--not-an-option", "file.txt"],
    });
  });

  it("parses agent-oriented flags", () => {
    const result = parser.parse([
      "ask",
      "--agent-mode",
      "router",
      "--disable-subagents",
      "how",
    ]);

    expect(result).toEqual({
      command: "ask",
      options: {
        agentMode: "router",
        disableSubagents: true,
      },
      positionals: ["how"],
    });
  });

  it("rejects unknown options", () => {
    const act = () => parser.parse(["ask", "--unknown"]);
    expect(act).toThrowError(CliParseError);
    expect(act).toThrowError(/Unknown option: --unknown/);
  });

  it("requires a valid command token", () => {
    const invalid = () => parser.parse(["--model", "gpt-4"]);
    const missing = () => parser.parse([]);

    expect(invalid).toThrowError(CliParseError);
    expect(invalid).toThrowError(/Invalid command: --model/);

    expect(missing).toThrowError(CliParseError);
    expect(missing).toThrowError(/No command provided\./);
  });
});

import "reflect-metadata";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { CliParserService, CliParseError } from "../../src/cli/cli-parser.service";

describe("CliParserService", () => {
  let moduleRef: TestingModule;
  let parser: CliParserService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [CliParserService],
    }).compile();

    parser = moduleRef.get(CliParserService);
  });

  afterAll(async () => {
    await moduleRef.close();
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
        context: "context-dir",
      },
      positionals: ["prompt", "question"],
    });
  });

  it("tracks boolean flags and preserves arguments after a terminator", () => {
    const result = parser.parse([
      "run",
      "--auto-approve",
      "--non-interactive",
      "--",
      "--not-an-option",
      "file.txt",
    ]);

    expect(result).toEqual({
      command: "run",
      options: {
        autoApprove: true,
        nonInteractive: true,
      },
      positionals: ["--not-an-option", "file.txt"],
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

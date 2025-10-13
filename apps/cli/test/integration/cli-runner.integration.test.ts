import "reflect-metadata";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { CliRunnerService } from "../../src/cli/cli-runner.service";
import { CliParserService } from "../../src/cli/cli-parser.service";
import { CliOptionsService } from "../../src/cli/cli-options.service";
import { CLI_COMMANDS } from "../../src/cli/cli.constants";
import { AskCommand } from "../../src/cli/commands/ask.command";
import { RunCommand } from "../../src/cli/commands/run.command";
import { ContextCommand } from "../../src/cli/commands/context.command";
import { ChatCommand } from "../../src/cli/commands/chat.command";
import { TraceCommand } from "../../src/cli/commands/trace.command";
import { EngineService } from "@eddie/engine";
import { ConfigStore } from "@eddie/config";
import { ContextService } from "@eddie/context";
import { TokenizerService } from "@eddie/tokenizers";
import { LoggerService } from "@eddie/io";
import type { CliCommand } from "../../src/cli/commands/cli-command";
import type { CliArguments } from "../../src/cli/cli-arguments";
import type { EddieConfig } from "@eddie/config";
import type { PackedContext } from "@eddie/types";

interface StubCommand extends CliCommand {
  execute: ReturnType<typeof vi.fn<[CliArguments], Promise<void>>>;
}

const createStubCommand = (name: string, description = "", aliases: string[] = []): StubCommand => ({
  metadata: { name, description, aliases },
  execute: vi.fn<[CliArguments], Promise<void>>().mockResolvedValue(),
});

const createConfig = (overrides: Partial<EddieConfig> = {}): EddieConfig => {
  const base: EddieConfig = {
    model: "gpt-4o",
    provider: { name: "openai" },
    projectDir: process.cwd(),
    context: {
      include: ["src/**/*.ts"],
      exclude: ["**/*.spec.ts"],
      baseDir: ".",
      maxBytes: 4096,
      maxFiles: 5,
    },
    systemPrompt: "You are Eddie.",
    logLevel: "info",
    logging: { level: "info" },
    output: { jsonlTrace: ".eddie/trace.jsonl" },
    tools: {},
    hooks: {},
    tokenizer: { provider: "openai" },
  };

  return {
    ...base,
    ...overrides,
    context: overrides.context ? { ...base.context, ...overrides.context } : base.context,
    logging: overrides.logging ? { ...base.logging, ...overrides.logging } : base.logging,
    output: overrides.output ? { ...base.output, ...overrides.output } : base.output,
    tokenizer: overrides.tokenizer
      ? { ...base.tokenizer, ...overrides.tokenizer }
      : base.tokenizer,
    tools: overrides.tools ?? base.tools,
    hooks: overrides.hooks ?? base.hooks,
  };
};

describe("CliRunnerService integration", () => {
  let moduleRef: TestingModule;
  let runner: CliRunnerService;
  let engine: { run: ReturnType<typeof vi.fn> };
  let configStore: { getSnapshot: ReturnType<typeof vi.fn> };
  let contextService: { pack: ReturnType<typeof vi.fn> };
  let tokenizerService: { create: ReturnType<typeof vi.fn> };
  let loggerService: {
    configure: ReturnType<typeof vi.fn>;
    getLogger: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    engine = {
      run: vi.fn().mockResolvedValue({ messages: [], context: { files: [], totalBytes: 0, text: "" } }),
    };
    contextService = { pack: vi.fn() };
    configStore = { getSnapshot: vi.fn() };
    tokenizerService = {
      create: vi.fn().mockReturnValue({ countTokens: vi.fn().mockReturnValue(42) }),
    };
    loggerService = {
      configure: vi.fn(),
      getLogger: vi.fn(() => ({ debug: vi.fn() })),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        CliParserService,
        CliOptionsService,
        {
          provide: AskCommand,
          useFactory: (engineService: EngineService, options: CliOptionsService) =>
            new AskCommand(engineService, options),
          inject: [EngineService, CliOptionsService],
        },
        {
          provide: RunCommand,
          useFactory: (engineService: EngineService, options: CliOptionsService) =>
            new RunCommand(engineService, options),
          inject: [EngineService, CliOptionsService],
        },
        {
          provide: ContextCommand,
          useFactory: (
            options: CliOptionsService,
            store: ConfigStore,
            logger: LoggerService,
            contextSvc: ContextService,
            tokenizer: TokenizerService
          ) => new ContextCommand(options, store, logger, contextSvc, tokenizer),
          inject: [
            CliOptionsService,
            ConfigStore,
            LoggerService,
            ContextService,
            TokenizerService,
          ],
        },
        {
          provide: CLI_COMMANDS,
          useFactory: (
            askCommand: AskCommand,
            runCommand: RunCommand,
            contextCommand: ContextCommand,
            chatCommand: ChatCommand,
            traceCommand: TraceCommand
          ): CliCommand[] => [askCommand, runCommand, contextCommand, chatCommand, traceCommand],
          inject: [AskCommand, RunCommand, ContextCommand, ChatCommand, TraceCommand],
        },
        {
          provide: CliRunnerService,
          useFactory: (parserService: CliParserService, commands: CliCommand[]) =>
            new CliRunnerService(parserService, commands),
          inject: [CliParserService, CLI_COMMANDS],
        },
        { provide: ChatCommand, useValue: createStubCommand("chat") },
        { provide: TraceCommand, useValue: createStubCommand("trace") },
        { provide: EngineService, useValue: engine },
        { provide: ConfigStore, useValue: configStore as ConfigStore },
        { provide: ContextService, useValue: contextService },
        { provide: TokenizerService, useValue: tokenizerService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    runner = moduleRef.get(CliRunnerService);
  });

  afterEach(async () => {
    await moduleRef.close();
    vi.restoreAllMocks();
  });

  it("runs the ask command with parsed engine options", async () => {
    await runner.run([
      "ask",
      "--model",
      "gpt-4",
      "--tools",
      "bash",
      "--tools",
      "edit",
      "--auto-approve",
      "Explain the context",
    ]);

    expect(engine.run).toHaveBeenCalledTimes(1);
    expect(engine.run.mock.calls[0][0]).toBe("Explain the context");
    expect(engine.run.mock.calls[0][1]).toMatchObject({
      model: "gpt-4",
      tools: ["bash", "edit"],
      autoApprove: true,
    });
  });

  it("passes literal arguments after the terminator to the run command", async () => {
    await runner.run(["run", "--auto-approve", "--", "--script", "main.ts"]);

    expect(engine.run).toHaveBeenCalledWith(
      "--script",
      expect.objectContaining({ autoApprove: true })
    );
  });

  it("prints a context preview using CLI-derived configuration", async () => {
    const mockConfig = createConfig({
      context: {
        include: ["src/**/*.ts"],
        exclude: ["**/*.spec.ts"],
        baseDir: "/tmp/eddie",
      },
      tokenizer: { provider: "anthropic" },
    });

    const packed: PackedContext = {
      files: [
        { path: "a.txt", bytes: 5, content: "hello" },
        { path: "b.ts", bytes: 7, content: "export const x = 1;" },
      ],
      totalBytes: 12,
      text: "file preview",
    };

    const countTokens = vi.fn().mockReturnValue(128);
    tokenizerService.create.mockReturnValue({ countTokens });
    configStore.getSnapshot.mockReturnValue(mockConfig);
    contextService.pack.mockResolvedValue(packed);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runner.run(["context", "-C", "src/**/*.ts"]);

    expect(configStore.getSnapshot).toHaveBeenCalledTimes(1);
    expect(contextService.pack).toHaveBeenCalledWith(mockConfig.context);
    expect(loggerService.configure).toHaveBeenCalledWith({
      level: mockConfig.logging?.level ?? mockConfig.logLevel,
      destination: mockConfig.logging?.destination,
      enableTimestamps: mockConfig.logging?.enableTimestamps,
    });
    expect(loggerService.getLogger).toHaveBeenCalledWith("cli:context");
    expect(countTokens).toHaveBeenCalledWith(packed.text);
    expect(logSpy).toHaveBeenCalledWith(
      `Context preview (${packed.files.length} files, ${packed.totalBytes} bytes, ~128 tokens)`
    );
    expect(logSpy).toHaveBeenCalledWith("────────────────────────────────────────────────────────");
    expect(logSpy).toHaveBeenCalledWith("• a.txt (5 bytes)");
    expect(logSpy).toHaveBeenCalledWith("• b.ts (7 bytes)");

    logSpy.mockRestore();
  });

  it("reads the latest snapshot from the config store when no overrides are provided", async () => {
    const snapshot = createConfig({
      context: { exclude: [], maxBytes: 2048, maxFiles: 50 },
    });

    configStore.getSnapshot.mockReturnValue(snapshot);
    contextService.pack.mockResolvedValue({ files: [], totalBytes: 0, text: "" });

    await runner.run(["context"]);

    expect(configStore.getSnapshot).toHaveBeenCalledTimes(1);
  });
});

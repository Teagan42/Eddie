import "reflect-metadata";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { CliRunnerService } from "../../src/cli/cli-runner.service";
import { CliParserService } from "../../src/cli/cli-parser.service";
import { CliOptionsService } from "../../src/cli/cli-options.service";
import { AskCommand } from "../../src/cli/commands/ask.command";
import { RunCommand } from "../../src/cli/commands/run.command";
import { ContextCommand } from "../../src/cli/commands/context.command";
import { ChatCommand } from "../../src/cli/commands/chat.command";
import { TraceCommand } from "../../src/cli/commands/trace.command";
import { EngineService } from "../../src/core/engine";
import { ConfigService } from "../../src/config";
import { ContextService } from "../../src/core/context";
import { TokenizerService } from "../../src/core/tokenizers/strategy";
import { LoggerService } from "../../src/io/logger";
import type { CliCommand } from "../../src/cli/commands/cli-command";
import type { CliArguments } from "../../src/cli/cli-arguments";
import type { EddieConfig } from "../../src/config/types";
import type { PackedContext } from "../../src/core/types";

interface StubCommand extends CliCommand {
  run: ReturnType<typeof vi.fn<[CliArguments], Promise<void>>>;
}

const createStubCommand = (name: string, aliases: string[] = []): StubCommand => ({
  name,
  aliases,
  run: vi.fn<[CliArguments], Promise<void>>().mockResolvedValue(),
});

describe("CliRunnerService integration", () => {
  let moduleRef: TestingModule;
  let runner: CliRunnerService;
  let engine: { run: ReturnType<typeof vi.fn> };
  let configService: { load: ReturnType<typeof vi.fn> };
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
    configService = { load: vi.fn() };
    contextService = { pack: vi.fn() };
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
            config: ConfigService,
            logger: LoggerService,
            contextSvc: ContextService,
            tokenizer: TokenizerService
          ) => new ContextCommand(options, config, logger, contextSvc, tokenizer),
          inject: [
            CliOptionsService,
            ConfigService,
            LoggerService,
            ContextService,
            TokenizerService,
          ],
        },
        {
          provide: CliRunnerService,
          useFactory: (
            parserService: CliParserService,
            askCommand: AskCommand,
            runCommand: RunCommand,
            contextCommand: ContextCommand,
            chatCommand: ChatCommand,
            traceCommand: TraceCommand
          ) =>
            new CliRunnerService(
              parserService,
              askCommand,
              runCommand,
              contextCommand,
              chatCommand,
              traceCommand
            ),
          inject: [
            CliParserService,
            AskCommand,
            RunCommand,
            ContextCommand,
            ChatCommand,
            TraceCommand,
          ],
        },
        { provide: ChatCommand, useValue: createStubCommand("chat") },
        { provide: TraceCommand, useValue: createStubCommand("trace") },
        { provide: EngineService, useValue: engine },
        { provide: ConfigService, useValue: configService },
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
    const mockConfig: EddieConfig = {
      model: "gpt-4o",
      provider: { name: "openai" },
      context: {
        include: ["src/**/*.ts"],
        exclude: ["**/*.spec.ts"],
        baseDir: "/tmp/eddie",
        maxBytes: 4096,
        maxFiles: 5,
      },
      systemPrompt: "You are Eddie.",
      logLevel: "info",
      logging: { level: "info" },
      output: { jsonlTrace: ".eddie/trace.jsonl" },
      tools: {},
      hooks: {},
      tokenizer: { provider: "anthropic" },
    };

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
    configService.load.mockResolvedValue(mockConfig);
    contextService.pack.mockResolvedValue(packed);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runner.run(["context", "-C", "src/**/*.ts"]);

    expect(configService.load).toHaveBeenCalledWith(
      expect.objectContaining({ context: ["src/**/*.ts"] })
    );
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
});

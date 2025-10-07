import "reflect-metadata";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import {
  CliModule,
  CliRunnerService,
  CliParserService,
  CliParseError,
  type CliArguments,
  type CliCommand,
  AskCommand,
  RunCommand,
  ContextCommand,
  ChatCommand,
  TraceCommand,
} from "../../src/cli";

const modules: TestingModule[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(modules.map((module) => module.close()));
  modules.length = 0;
});

interface StubCommand extends CliCommand {
  run: ReturnType<typeof vi.fn>;
}

const createStubCommand = (name: string, aliases: string[] = []): StubCommand => ({
  name,
  aliases,
  run: vi.fn<[], Promise<void>>().mockResolvedValue(),
});

describe("CliRunnerService", () => {
  const createRunner = async (overrides?: {
    parser?: Partial<CliParserService> & { parse?: ReturnType<typeof vi.fn> };
    ask?: StubCommand;
    run?: StubCommand;
    context?: StubCommand;
    chat?: StubCommand;
    trace?: StubCommand;
  }) => {
    const parseMock =
      overrides?.parser?.parse ??
      vi.fn((args: string[]) => ({
        command: args[0] ?? "",
        options: {},
        positionals: args.slice(1),
      } satisfies CliArguments));

    const parser = {
      ...(overrides?.parser ?? {}),
      parse: parseMock,
    } as CliParserService;

    const ask = (overrides?.ask ?? createStubCommand("ask")) as AskCommand;
    const run = (overrides?.run ?? createStubCommand("run")) as RunCommand;
    const context = (overrides?.context ?? createStubCommand("context")) as ContextCommand;
    const chat = (overrides?.chat ?? createStubCommand("chat")) as ChatCommand;
    const trace = (overrides?.trace ?? createStubCommand("trace")) as TraceCommand;

    const moduleRef = await Test.createTestingModule({
      imports: [CliModule],
    })
      .overrideProvider(CliParserService)
      .useValue(parser)
      .overrideProvider(AskCommand)
      .useValue(ask)
      .overrideProvider(RunCommand)
      .useValue(run)
      .overrideProvider(ContextCommand)
      .useValue(context)
      .overrideProvider(ChatCommand)
      .useValue(chat)
      .overrideProvider(TraceCommand)
      .useValue(trace)
      .overrideProvider(CliRunnerService)
      .useFactory({
        factory: (
          injectedParser: CliParserService,
          askCommand: AskCommand,
          runCommand: RunCommand,
          contextCommand: ContextCommand,
          chatCommand: ChatCommand,
          traceCommand: TraceCommand
        ) =>
          new CliRunnerService(
            injectedParser,
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
      })
      .compile();

    modules.push(moduleRef);

    const runner = moduleRef.get(CliRunnerService);

    return { runner, parser, parseMock, ask, run, context, chat, trace };
  };

  it("delegates to the parsed command", async () => {
    const { runner, parseMock, ask } = await createRunner();
    const parsed: CliArguments = {
      command: "ask",
      options: { auto: true },
      positionals: ["hello"],
    };
    parseMock.mockReturnValue(parsed);

    await runner.run(["ask", "hello"]);

    expect(parseMock).toHaveBeenCalledWith(["ask", "hello"]);
    expect(ask.run).toHaveBeenCalledWith(parsed);
  });

  it("supports command aliases", async () => {
    const aliasCommand = createStubCommand("trace", ["t"]);
    const { runner, parseMock, trace } = await createRunner({ trace: aliasCommand });
    const parsed: CliArguments = { command: "t", options: {}, positionals: [] };
    parseMock.mockReturnValue(parsed);

    await runner.run(["t"]);

    expect(trace.run).toHaveBeenCalledWith(parsed);
  });

  it("prints usage information when help is requested", async () => {
    const { runner, ask, run, context, chat, trace } = await createRunner();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runner.run(["help"]);

    expect(logSpy).toHaveBeenCalledWith("Usage: eddie <command> [options]");
    expect(ask.run).not.toHaveBeenCalled();
    expect(run.run).not.toHaveBeenCalled();
    expect(context.run).not.toHaveBeenCalled();
    expect(chat.run).not.toHaveBeenCalled();
    expect(trace.run).not.toHaveBeenCalled();
  });

  it("wraps parser errors in user-friendly exceptions", async () => {
    const parser = {
      parse: vi.fn(() => {
        throw new CliParseError("bad news");
      }),
    } as unknown as CliParserService;

    const { runner } = await createRunner({ parser });

    await expect(runner.run(["ask"])).rejects.toThrowError(new Error("bad news"));
  });

  it("rejects unknown commands", async () => {
    const { runner, parseMock } = await createRunner();
    const parsed: CliArguments = { command: "unknown", options: {}, positionals: [] };
    parseMock.mockReturnValue(parsed);

    await expect(runner.run(["unknown"])).rejects.toThrowError(
      new Error("Unknown command: unknown")
    );
  });

  it("requires a command to be provided", async () => {
    const { runner } = await createRunner();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(runner.run([])).rejects.toThrowError(new Error("No command provided."));
    expect(logSpy).toHaveBeenCalledWith("Usage: eddie <command> [options]");
  });
});

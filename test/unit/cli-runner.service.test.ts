import { describe, it, expect, vi, afterEach } from "vitest";
import { CliRunnerService } from "../../src/cli/cli-runner.service";
import type { CliArguments } from "../../src/cli/cli-arguments";
import { CliParseError } from "../../src/cli/cli-parser.service";
import type { CliCommand } from "../../src/cli/commands/cli-command";
import type { CliParserService } from "../../src/cli/cli-parser.service";
import type { AskCommand } from "../../src/cli/commands/ask.command";
import type { RunCommand } from "../../src/cli/commands/run.command";
import type { ContextCommand } from "../../src/cli/commands/context.command";
import type { ChatCommand } from "../../src/cli/commands/chat.command";
import type { TraceCommand } from "../../src/cli/commands/trace.command";

afterEach(() => {
  vi.restoreAllMocks();
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
  const createRunner = (overrides?: {
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
      parse: parseMock,
      ...overrides?.parser,
    } as CliParserService;

    const ask = (overrides?.ask ?? createStubCommand("ask")) as AskCommand;
    const run = (overrides?.run ?? createStubCommand("run")) as RunCommand;
    const context = (overrides?.context ?? createStubCommand("context")) as ContextCommand;
    const chat = (overrides?.chat ?? createStubCommand("chat")) as ChatCommand;
    const trace = (overrides?.trace ?? createStubCommand("trace")) as TraceCommand;

    const runner = new CliRunnerService(parser, ask, run, context, chat, trace);

    return { runner, parser, parseMock, ask, run, context, chat, trace };
  };

  it("delegates to the parsed command", async () => {
    const { runner, parseMock, ask } = createRunner();
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
    const { runner, parseMock } = createRunner({ trace: aliasCommand });
    const parsed: CliArguments = { command: "t", options: {}, positionals: [] };
    parseMock.mockReturnValue(parsed);

    await runner.run(["t"]);

    expect(aliasCommand.run).toHaveBeenCalledWith(parsed);
  });

  it("prints usage information when help is requested", async () => {
    const { runner, ask, run, context, chat, trace } = createRunner();
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

    const { runner } = createRunner({ parser });

    await expect(runner.run(["ask"])).rejects.toThrowError(new Error("bad news"));
  });

  it("rejects unknown commands", async () => {
    const { runner, parseMock } = createRunner();
    const parsed: CliArguments = { command: "unknown", options: {}, positionals: [] };
    parseMock.mockReturnValue(parsed);

    await expect(runner.run(["unknown"])).rejects.toThrowError(
      new Error("Unknown command: unknown")
    );
  });

  it("requires a command to be provided", async () => {
    const { runner } = createRunner();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(runner.run([])).rejects.toThrowError(new Error("No command provided."));
    expect(logSpy).toHaveBeenCalledWith("Usage: eddie <command> [options]");
  });
});

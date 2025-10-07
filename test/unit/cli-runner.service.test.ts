import "reflect-metadata";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  CliRunnerService,
  CliParserService,
  CliParseError,
  type CliArguments,
  type CliCommand,
} from "../../src/cli";

afterEach(() => {
  vi.restoreAllMocks();
});

interface StubCommand extends CliCommand {
  execute: ReturnType<typeof vi.fn>;
}

const createStubCommand = (
  name: string,
  description = "",
  aliases: string[] = []
): StubCommand => ({
  metadata: { name, description, aliases },
  execute: vi.fn<[], Promise<void>>().mockResolvedValue(),
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
      ...(overrides?.parser ?? {}),
      parse: parseMock,
    } as CliParserService;

    const ask = overrides?.ask ?? createStubCommand("ask");
    const run = overrides?.run ?? createStubCommand("run");
    const context = overrides?.context ?? createStubCommand("context");
    const chat = overrides?.chat ?? createStubCommand("chat");
    const trace = overrides?.trace ?? createStubCommand("trace");

    const runner = new CliRunnerService(parser, [ask, run, context, chat, trace]);

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
    expect(ask.execute).toHaveBeenCalledWith(parsed);
  });

  it("supports command aliases", async () => {
    const aliasCommand = createStubCommand("trace", "", ["t"]);
    const { runner, parseMock, trace } = createRunner({ trace: aliasCommand });
    const parsed: CliArguments = { command: "t", options: {}, positionals: [] };
    parseMock.mockReturnValue(parsed);

    await runner.run(["t"]);

    expect(trace.execute).toHaveBeenCalledWith(parsed);
  });

  it("prints usage information when help is requested", async () => {
    const { runner, ask, run, context, chat, trace } = createRunner();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runner.run(["help"]);

    expect(logSpy).toHaveBeenCalledWith("Usage: eddie <command> [options]");
    expect(ask.execute).not.toHaveBeenCalled();
    expect(run.execute).not.toHaveBeenCalled();
    expect(context.execute).not.toHaveBeenCalled();
    expect(chat.execute).not.toHaveBeenCalled();
    expect(trace.execute).not.toHaveBeenCalled();
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

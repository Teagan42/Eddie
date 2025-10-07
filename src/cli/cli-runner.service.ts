import { Injectable } from "@nestjs/common";
import type { CliCommand } from "./commands/cli-command";
import { AskCommand } from "./commands/ask.command";
import { ChatCommand } from "./commands/chat.command";
import { ContextCommand } from "./commands/context.command";
import { RunCommand } from "./commands/run.command";
import { TraceCommand } from "./commands/trace.command";
import type { CliArguments } from "./cli-arguments";
import { CliParserService, CliParseError } from "./cli-parser.service";

@Injectable()
export class CliRunnerService {
  private readonly commands: CliCommand[];

  constructor(
    private readonly parser: CliParserService,
    ask: AskCommand,
    run: RunCommand,
    context: ContextCommand,
    chat: ChatCommand,
    trace: TraceCommand
  ) {
    this.commands = [ask, run, context, chat, trace];
  }

  async run(argv: string[]): Promise<void> {
    const normalizedArgs = argv[0] === "--" ? argv.slice(1) : argv;

    if (normalizedArgs.length === 0 || this.isHelpRequest(normalizedArgs[0])) {
      this.printUsage();
      if (normalizedArgs.length === 0) {
        throw new Error("No command provided.");
      }
      return;
    }

    let parsed: CliArguments;
    try {
      parsed = this.parser.parse(normalizedArgs);
    } catch (error) {
      if (error instanceof CliParseError) {
        throw new Error(error.message);
      }
      throw error;
    }

    const command = this.resolveCommand(parsed.command);
    if (!command) {
      throw new Error(`Unknown command: ${parsed.command}`);
    }

    await command.run(parsed);
  }

  private resolveCommand(name: string): CliCommand | undefined {
    const normalized = name.toLowerCase();
    return this.commands.find((command) => {
      if (command.name === normalized) {
        return true;
      }
      return command.aliases?.includes(normalized);
    });
  }

  private isHelpRequest(token: string): boolean {
    return ["help", "-h", "--help"].includes(token);
  }

  private printUsage(): void {
    const names = this.commands.map((command) => command.name).join(", ");
    console.log("Usage: eddie <command> [options]");
    console.log("");
    console.log(`Available commands: ${names}`);
  }
}

import { Inject, Injectable, Logger } from "@nestjs/common";
import { CLI_COMMANDS } from "./cli.constants";
import type { CliCommand } from "./commands/cli-command";
import type { CliArguments } from "./cli-arguments";
import { CliParserService, CliParseError } from "./cli-parser.service";

@Injectable()
export class CliRunnerService {
  private readonly logger = new Logger(CliRunnerService.name);

  constructor(
    private readonly parser: CliParserService,
    @Inject(CLI_COMMANDS) private readonly commands: CliCommand[]
  ) {}

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

    this.logger.debug(`Executing command ${command.metadata.name}`);

    await command.execute(parsed);
  }

  private resolveCommand(name: string): CliCommand | undefined {
    const normalized = name.toLowerCase();
    return this.commands.find((command) => {
      const { metadata } = command;
      if (metadata.name === normalized) {
        return true;
      }
      return metadata.aliases?.some((alias) => alias.toLowerCase() === normalized);
    });
  }

  private isHelpRequest(token: string): boolean {
    return ["help", "-h", "--help"].includes(token);
  }

  private printUsage(): void {
    const rows = this.commands.map(({ metadata }) => {
      const aliasSuffix = metadata.aliases?.length
        ? ` (aliases: ${metadata.aliases.join(", ")})`
        : "";
      return `- ${metadata.name}${aliasSuffix}: ${metadata.description}`;
    });

    console.log("Usage: eddie <command> [options]");
    console.log("");
    console.log("Available commands:");
    for (const row of rows) {
      console.log(row);
    }
  }
}

import { Injectable } from "@nestjs/common";
import type { CliArguments } from "./cli-arguments";

export class CliParseError extends Error {}

@Injectable()
export class CliParserService {
  private static readonly OPTION_ALIASES = new Map<string, string>([
    ["--context", "context"],
    ["-C", "context"],
    ["--config", "config"],
    ["-c", "config"],
    ["--model", "model"],
    ["-m", "model"],
    ["--provider", "provider"],
    ["-p", "provider"],
    ["--tools", "tools"],
    ["-t", "tools"],
    ["--disable-tools", "disableTools"],
    ["-D", "disableTools"],
    ["--jsonl-trace", "jsonlTrace"],
    ["--log-level", "logLevel"],
    ["--log-file", "logFile"],
    ["--agent-mode", "agentMode"],
  ]);

  private static readonly BOOLEAN_FLAGS = new Map<string, string>([
    ["--auto-approve", "autoApprove"],
    ["--auto", "auto"],
    ["--non-interactive", "nonInteractive"],
    ["--disable-subagents", "disableSubagents"],
  ]);

  parse(argv: string[]): CliArguments {
    if (argv.length === 0) {
      throw new CliParseError("No command provided.");
    }

    const [command, ...rest] = argv;
    if (!command || command.startsWith("-")) {
      throw new CliParseError(`Invalid command: ${command ?? "<empty>"}`);
    }

    const options: Record<string, unknown> = {};
    const positionals: string[] = [];

    for (let i = 0; i < rest.length; i += 1) {
      const token = rest[i];
      if (token === "--") {
        positionals.push(...rest.slice(i + 1));
        break;
      }

      if (!token.startsWith("-")) {
        positionals.push(token);
        continue;
      }

      if (CliParserService.BOOLEAN_FLAGS.has(token)) {
        const key = CliParserService.BOOLEAN_FLAGS.get(token);
        if (!key) continue;
        options[key] = true;
        continue;
      }

      const optionKey = CliParserService.OPTION_ALIASES.get(token);
      if (!optionKey) {
        throw new CliParseError(`Unknown option: ${token}`);
      }

      const next = rest[i + 1];
      if (next === undefined || next.startsWith("-")) {
        throw new CliParseError(`Option ${token} requires a value.`);
      }

      i += 1;
      const existing = options[optionKey];
      if (existing === undefined) {
        options[optionKey] = next;
        continue;
      }

      if (Array.isArray(existing)) {
        existing.push(next);
        continue;
      }

      options[optionKey] = [existing, next];
    }

    return { command, options, positionals };
  }
}

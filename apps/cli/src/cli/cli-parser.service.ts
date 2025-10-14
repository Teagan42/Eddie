import {
  CLI_BOOLEAN_OPTIONS_BY_FLAG,
  CLI_VALUE_OPTIONS_BY_FLAG,
} from "@eddie/config";
import { Injectable } from "@nestjs/common";
import type { CliArguments } from "./cli-arguments";

export class CliParseError extends Error {}

@Injectable()
export class CliParserService {
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

      const booleanDefinition = CLI_BOOLEAN_OPTIONS_BY_FLAG.get(token);
      if (booleanDefinition) {
        options[booleanDefinition.runtimeKey] = true;
        continue;
      }

      const optionDefinition = CLI_VALUE_OPTIONS_BY_FLAG.get(token);
      if (!optionDefinition) {
        throw new CliParseError(`Unknown option: ${token}`);
      }

      const next = rest[i + 1];
      if (next === undefined || next.startsWith("-")) {
        throw new CliParseError(`Option ${token} requires a value.`);
      }

      i += 1;
      const optionKey = optionDefinition.runtimeKey;
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

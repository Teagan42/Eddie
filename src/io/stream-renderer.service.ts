import { Injectable } from "@nestjs/common";
import chalk from "chalk";
import type { StreamEvent } from "../core/types";
import { redactSecrets } from "./redact";

const DEFAULT_PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
  /AIza[0-9A-Za-z\-_]{35}/g,
];

@Injectable()
export class StreamRendererService {
  render(event: StreamEvent): void {
    switch (event.type) {
      case "delta": {
        process.stdout.write(event.text);
        break;
      }
      case "tool_call": {
        const args =
          typeof event.arguments === "string"
            ? event.arguments
            : JSON.stringify(event.arguments, null, 2);
        const redacted = redactSecrets(args, DEFAULT_PATTERNS);
        process.stdout.write(
          `\n${chalk.cyan("[tool_call]")} ${event.name} ${redacted}\n`
        );
        break;
      }
      case "tool_result": {
        const summary =
          typeof event.result === "string"
            ? event.result
            : JSON.stringify(event.result, null, 2);
        process.stdout.write(
          `\n${chalk.green("[tool_result]")} ${event.name} ${summary}\n`
        );
        break;
      }
      case "error": {
        process.stderr.write(
          `\n${chalk.red("[error]")} ${event.message}\n${event.cause ?? ""}\n`
        );
        break;
      }
      case "end": {
        process.stdout.write(`\n${chalk.gray("[done]")}\n`);
        break;
      }
      default:
        break;
    }
  }
}

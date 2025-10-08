import { Injectable } from "@nestjs/common";
import chalk from "chalk";
import type { StreamEvent } from "@eddie/types";
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
        const summary = redactSecrets(event.result.content, DEFAULT_PATTERNS);
        const structured =
          event.result.data !== undefined
            ? ` ${redactSecrets(JSON.stringify(event.result.data, null, 2), DEFAULT_PATTERNS)}`
            : "";
        const metadata =
          event.result.metadata && Object.keys(event.result.metadata).length > 0
            ? ` ${redactSecrets(JSON.stringify(event.result.metadata), DEFAULT_PATTERNS)}`
            : "";
        process.stdout.write(
          `\n${chalk.green("[tool_result]")} ${event.name} <${event.result.schema}> ${summary}${structured}${metadata}\n`
        );
        break;
      }
      case "notification": {
        const body =
          typeof event.payload === "string"
            ? event.payload
            : JSON.stringify(event.payload, null, 2);
        const metadata = event.metadata && Object.keys(event.metadata).length > 0
          ? ` ${redactSecrets(JSON.stringify(event.metadata), DEFAULT_PATTERNS)}`
          : "";
        process.stdout.write(
          `\n${chalk.yellow("[notification]")} ${redactSecrets(body, DEFAULT_PATTERNS)}${metadata}\n`
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

  flush(): void {
    process.stdout.write("\n");
  }
}

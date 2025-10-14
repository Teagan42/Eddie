import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import path from "path";
import { Injectable } from "@nestjs/common";
import { ConfigStore } from "@eddie/config";
import type { CliArguments } from "../cli-arguments";
import { CliOptionsService } from "../cli-options.service";
import type { CliCommand, CliCommandMetadata } from "./cli-command";

const TRACE_STREAM_CHUNK_SIZE = 64 * 1024;

@Injectable()
export class TraceCommand implements CliCommand {
  readonly metadata: CliCommandMetadata = {
    name: "trace",
    description: "Pretty-print recent JSONL trace entries.",
  };

  constructor(
    private readonly optionsService: CliOptionsService,
    private readonly configStore: ConfigStore
  ) {}

  async execute(args: CliArguments): Promise<void> {
    const engineOptions = this.optionsService.parse(args.options);
    const cfg = this.configStore.getSnapshot();

    const tracePath =
      engineOptions.jsonlTrace ?? cfg.output?.jsonlTrace ?? ".eddie/trace.jsonl";

    try {
      const absolute = path.resolve(tracePath);
      const lines = await this.readTraceTail(absolute);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          console.log(JSON.stringify(parsed, null, 2));
        } catch {
          console.log(line);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Unable to read trace at ${tracePath}: ${message}`);
    }
  }

  private async readTraceTail(filePath: string): Promise<string[]> {
    const stream = createReadStream(filePath, {
      encoding: "utf-8",
      highWaterMark: TRACE_STREAM_CHUNK_SIZE,
    });
    const reader = createInterface({ input: stream, crlfDelay: Infinity });
    const lines: string[] = [];
    const pendingWhitespace: string[] = [];
    let hasContent = false;

    const pushLine = (value: string) => {
      lines.push(value);
      if (lines.length > 50) {
        lines.shift();
      }
    };

    try {
      for await (const rawLine of reader) {
        if (rawLine.trim().length === 0) {
          if (!hasContent) {
            continue;
          }

          pendingWhitespace.push(rawLine);
          continue;
        }

        let normalizedLine = rawLine;
        if (!hasContent) {
          normalizedLine = rawLine.trimStart();
          hasContent = true;
        }

        if (pendingWhitespace.length > 0) {
          for (const whitespaceLine of pendingWhitespace) {
            pushLine(whitespaceLine);
          }
          pendingWhitespace.length = 0;
        }

        pushLine(normalizedLine);
      }
    } finally {
      reader.close();
      stream.destroy();
    }

    if (lines.length > 0) {
      const lastIndex = lines.length - 1;
      lines[lastIndex] = lines[lastIndex]?.trimEnd();
    }

    return lines;
  }
}

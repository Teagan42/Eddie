import { createReadStream } from "fs";
import path from "path";
import { Injectable } from "@nestjs/common";
import { ConfigStore } from "@eddie/config";
import type { CliArguments } from "../cli-arguments";
import { CliOptionsService } from "../cli-options.service";
import type { CliCommand, CliCommandMetadata } from "./cli-command";

const TRACE_LINE_LIMIT = 50;
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
      const lines = await this.readRecentTraceLines(absolute, TRACE_LINE_LIMIT);

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

  private async readRecentTraceLines(
    filePath: string,
    limit: number
  ): Promise<string[]> {
    const stream = createReadStream(filePath, {
      encoding: "utf-8",
      highWaterMark: TRACE_STREAM_CHUNK_SIZE,
    });

    let buffer = "";
    const accumulator = this.createLineAccumulator(limit);

    try {
      for await (const chunk of stream) {
        buffer += chunk;

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          accumulator.add(line);
        }
      }

      if (buffer.length > 0) {
        accumulator.add(buffer);
      }
    } finally {
      stream.destroy();
    }

    return accumulator.lines();
  }

  private createLineAccumulator(limit: number) {
    const queue: string[] = [];
    let trailingWhitespace: string[] = [];
    let seenContent = false;

    const pushLine = (line: string) => {
      queue.push(line);
      if (queue.length > limit) {
        queue.splice(0, queue.length - limit);
      }
    };

    const flushTrailingWhitespace = () => {
      if (trailingWhitespace.length === 0) {
        return;
      }

      for (const whitespace of trailingWhitespace) {
        pushLine(whitespace);
      }

      trailingWhitespace = [];
    };

    return {
      add(line: string) {
        if (!seenContent) {
          if (line.trim().length === 0) {
            return;
          }

          seenContent = true;
          pushLine(line);
          return;
        }

        if (line.length === 0) {
          return;
        }

        if (line.trim().length === 0) {
          trailingWhitespace.push(line);
          return;
        }

        flushTrailingWhitespace();
        pushLine(line);
      },
      lines(): string[] {
        return queue;
      },
    } as const;
  }
}

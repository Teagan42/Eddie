import fs from "fs/promises";
import path from "path";
import { Injectable } from "@nestjs/common";
import { ConfigStore } from "@eddie/config";
import type { CliArguments } from "../cli-arguments";
import { CliOptionsService } from "../cli-options.service";
import type { CliCommand, CliCommandMetadata } from "./cli-command";

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
      const data = await fs.readFile(absolute, "utf-8");
      const lines = data
        .trim()
        .split("\n")
        .filter(Boolean)
        .slice(-50);

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
}

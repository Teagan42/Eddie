import type { CliArguments } from "../cli-arguments";

export interface CliCommandMetadata {
  readonly name: string;
  readonly description: string;
  readonly aliases?: string[];
}

export interface CliCommand {
  readonly metadata: CliCommandMetadata;
  execute(args: CliArguments): Promise<void>;
}

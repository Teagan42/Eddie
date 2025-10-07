import type { CliArguments } from "../cli-arguments";

export interface CliCommand {
  readonly name: string;
  readonly aliases?: string[];
  run(args: CliArguments): Promise<void>;
}

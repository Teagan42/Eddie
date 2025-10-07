import { Injectable } from "@nestjs/common";
import { EngineService } from "../../core/engine";
import type { CliArguments } from "../cli-arguments";
import { CliOptionsService } from "../cli-options.service";
import type { CliCommand, CliCommandMetadata } from "./cli-command";

@Injectable()
export class RunCommand implements CliCommand {
  readonly metadata: CliCommandMetadata = {
    name: "run",
    description: "Execute a single prompt using the configured engine.",
  };

  constructor(
    private readonly engine: EngineService,
    private readonly optionsService: CliOptionsService
  ) {}

  async execute(args: CliArguments): Promise<void> {
    const prompt = args.positionals[0];
    if (!prompt) {
      throw new Error("The run command requires a prompt argument.");
    }

    const options = this.optionsService.parse(args.options);
    await this.engine.run(prompt, options);
  }
}

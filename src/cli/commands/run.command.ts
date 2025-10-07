import { Injectable } from "@nestjs/common";
import { EngineService } from "../../core/engine";
import type { CliArguments } from "../cli-arguments";
import { CliOptionsService } from "../cli-options.service";
import type { CliCommand } from "./cli-command";

@Injectable()
export class RunCommand implements CliCommand {
  readonly name = "run";

  constructor(
    private readonly engine: EngineService,
    private readonly optionsService: CliOptionsService
  ) {}

  async run(args: CliArguments): Promise<void> {
    const prompt = args.positionals[0];
    if (!prompt) {
      throw new Error("The run command requires a prompt argument.");
    }

    const options = this.optionsService.parse(args.options);
    await this.engine.run(prompt, options);
  }
}

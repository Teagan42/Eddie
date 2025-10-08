import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { Injectable } from "@nestjs/common";
import { EngineService } from "../../core/engine/engine.service";
import type { ChatMessage } from "../../core/types";
import type { CliArguments } from "../cli-arguments";
import { CliOptionsService } from "../cli-options.service";
import type { CliCommand, CliCommandMetadata } from "./cli-command";

@Injectable()
export class ChatCommand implements CliCommand {
  readonly metadata: CliCommandMetadata = {
    name: "chat",
    description: "Start an interactive chat session.",
  };

  constructor(
    private readonly engine: EngineService,
    private readonly optionsService: CliOptionsService
  ) {}

  async execute(args: CliArguments): Promise<void> {
    const engineOptions = this.optionsService.parse(args.options);
    const rl = readline.createInterface({ input, output });
    const history: ChatMessage[] = [];

    try {
      while (true) {
        const prompt = (await rl.question("> ")).trim();
        if (!prompt) {
          continue;
        }

        if (["exit", "quit", "q"].includes(prompt.toLowerCase())) {
          break;
        }

        const result = await this.engine.run(prompt, {
          ...engineOptions,
          history,
        });

        const assistant = [...result.messages]
          .reverse()
          .find(
            (message) =>
              message.role === "assistant" && message.content.trim().length > 0
          );

        history.push({ role: "user", content: prompt });
        if (assistant) {
          history.push({ role: "assistant", content: assistant.content });
        }

        process.stdout.write("\n");
      }
    } finally {
      rl.close();
    }
  }
}

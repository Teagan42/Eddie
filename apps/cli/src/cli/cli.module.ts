import { Module, type Provider } from "@nestjs/common";
import { ConfigModule } from "@eddie/config";
import { ContextModule } from "@eddie/context";
import { EngineModule } from "@eddie/engine";
import { IoModule } from "@eddie/io";
import { TokenizersModule } from "@eddie/tokenizers";
import { CliOptionsService } from "./cli-options.service";
import { CliParserService } from "./cli-parser.service";
import { CliRunnerService } from "./cli-runner.service";
import { CLI_COMMANDS } from "./cli.constants";
import { AskCommand } from "./commands/ask.command";
import { ChatCommand } from "./commands/chat.command";
import {
  ConfigCommand,
  CONFIG_WIZARD_PROMPTER,
  InquirerConfigWizardPrompter,
} from "./commands/config.command";
import { ContextCommand } from "./commands/context.command";
import { RunCommand } from "./commands/run.command";
import { TraceCommand } from "./commands/trace.command";
import type { CliCommand } from "./commands/cli-command";

const commandProviders: Provider[] = [
  AskCommand,
  RunCommand,
  ContextCommand,
  ChatCommand,
  TraceCommand,
  ConfigCommand,
  {
    provide: CONFIG_WIZARD_PROMPTER,
    useClass: InquirerConfigWizardPrompter,
  },
  {
    provide: CLI_COMMANDS,
    useFactory: (
      ask: AskCommand,
      run: RunCommand,
      context: ContextCommand,
      chat: ChatCommand,
      trace: TraceCommand,
      config: ConfigCommand,
    ): CliCommand[] => [ask, run, context, chat, trace, config],
    inject: [
      AskCommand,
      RunCommand,
      ContextCommand,
      ChatCommand,
      TraceCommand,
      ConfigCommand,
    ],
  },
];

/**
 * CliModule bundles the CLI surface so commands and supporting services can be
 * injected wherever a Nest application context is available.
 */
@Module({
  imports: [ConfigModule, ContextModule, EngineModule, IoModule, TokenizersModule],
  providers: [
    CliOptionsService,
    CliParserService,
    CliRunnerService,
    ...commandProviders,
  ],
  exports: [CliRunnerService],
})
export class CliModule {}

import { Module, type Provider } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { ContextModule } from "../core/context/context.module";
import { EngineModule } from "../core/engine/engine.module";
import { IoModule } from "../io/io.module";
import { TokenizersModule } from "../core/tokenizers/tokenizers.module";
import { CliOptionsService } from "./cli-options.service";
import { CliParserService } from "./cli-parser.service";
import { CliRunnerService } from "./cli-runner.service";
import { CLI_COMMANDS } from "./cli.constants";
import { AskCommand } from "./commands/ask.command";
import { ChatCommand } from "./commands/chat.command";
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
  {
    provide: CLI_COMMANDS,
    useFactory: (
      ask: AskCommand,
      run: RunCommand,
      context: ContextCommand,
      chat: ChatCommand,
      trace: TraceCommand
    ): CliCommand[] => [ask, run, context, chat, trace],
    inject: [AskCommand, RunCommand, ContextCommand, ChatCommand, TraceCommand],
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

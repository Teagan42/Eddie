import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { ContextModule } from "../core/context";
import { EngineModule } from "../core/engine/engine.module";
import { IoModule } from "../io";
import { TokenizersModule } from "../core/tokenizers";
import { CliOptionsService } from "./cli-options.service";
import { CliParserService } from "./cli-parser.service";
import { CliRunnerService } from "./cli-runner.service";
import { AskCommand } from "./commands/ask.command";
import { ChatCommand } from "./commands/chat.command";
import { ContextCommand } from "./commands/context.command";
import { RunCommand } from "./commands/run.command";
import { TraceCommand } from "./commands/trace.command";

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
    AskCommand,
    RunCommand,
    ContextCommand,
    ChatCommand,
    TraceCommand,
  ],
  exports: [CliRunnerService],
})
export class CliModule {}

import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { ContextModule } from "./core/context/context.module";
import { EngineModule } from "./core/engine/engine.module";
import { IoModule } from "./io/io.module";
import { CliOptionsService } from "./cli/cli-options.service";
import { CliParserService } from "./cli/cli-parser.service";
import { CliRunnerService } from "./cli/cli-runner.service";
import { AskCommand } from "./cli/commands/ask.command";
import { RunCommand } from "./cli/commands/run.command";
import { ContextCommand } from "./cli/commands/context.command";
import { ChatCommand } from "./cli/commands/chat.command";
import { TraceCommand } from "./cli/commands/trace.command";

@Module({
  imports: [ConfigModule, ContextModule, IoModule, EngineModule],
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
})
export class AppModule {}

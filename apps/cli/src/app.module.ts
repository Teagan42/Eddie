import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { ContextModule } from "./core/context/context.module";
import { EngineModule } from "./core/engine/engine.module";
import { IoModule } from "./io/io.module";
import { CliModule } from "./cli/cli.module";

@Module({
  imports: [ConfigModule, ContextModule, IoModule, EngineModule, CliModule],
})
export class AppModule {}

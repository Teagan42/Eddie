import { Module } from "@nestjs/common";
import { ConfigModule } from "@eddie/config";
import { ContextModule } from "@eddie/context";
import { EngineModule } from "@eddie/engine";
import { IoModule } from "@eddie/io";
import { CliModule } from "./cli/cli.module";

@Module({
  imports: [ConfigModule, ContextModule, IoModule, EngineModule, CliModule],
})
export class AppModule {}

import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { ContextModule } from "./core/context/context.module";
import { EngineModule } from "./core/engine/engine.module";
import { IoModule } from "./io/io.module";

@Module({
  imports: [ConfigModule, ContextModule, IoModule, EngineModule],
})
export class AppModule {}

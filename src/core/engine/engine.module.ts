import { Module } from "@nestjs/common";
import { ConfigModule } from "../../config/config.module";
import { ContextModule } from "../context/context.module";
import { IoModule } from "../../io";
import { HooksModule } from "../../hooks";
import { ProvidersModule } from "../providers/providers.module";
import { TokenizersModule } from "../tokenizers";
import { EngineService } from "./engine.service";
import { ToolRegistryFactory } from "../tools/registry";

@Module({
  imports: [
    ConfigModule,
    ContextModule,
    IoModule,
    HooksModule,
    ProvidersModule,
    TokenizersModule,
  ],
  providers: [EngineService, ToolRegistryFactory],
  exports: [
    EngineService,
    ToolRegistryFactory,
    HooksModule,
    ProvidersModule,
    TokenizersModule,
  ],
})
export class EngineModule {}

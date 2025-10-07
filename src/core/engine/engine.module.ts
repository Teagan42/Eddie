import { Module } from "@nestjs/common";
import { ConfigModule } from "../../config/config.module";
import { ContextModule } from "../context/context.module";
import { IoModule } from "../../io";
import { EngineService } from "./engine.service";
import { ProviderFactory } from "../providers";
import { ToolRegistryFactory } from "../tools/registry";
import { HooksModule } from "../../hooks";
import { TokenizersModule } from "../tokenizers";

@Module({
  imports: [ConfigModule, ContextModule, IoModule, HooksModule, TokenizersModule],
  providers: [EngineService, ProviderFactory, ToolRegistryFactory],
  exports: [
    EngineService,
    ProviderFactory,
    ToolRegistryFactory,
    HooksModule,
    TokenizersModule,
  ],
})
export class EngineModule {}

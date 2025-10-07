import { Module } from "@nestjs/common";
import { ConfigModule } from "../../config/config.module";
import { ContextModule } from "../context/context.module";
import { IoModule } from "../../io";
import { EngineService } from "./engine.service";
import { ProviderFactory } from "../providers";
import { ToolRegistryFactory } from "../tools/registry";
import { HooksService } from "../../hooks/loader";
import { TokenizerService } from "../tokenizers/strategy";

@Module({
  imports: [ConfigModule, ContextModule, IoModule],
  providers: [EngineService, ProviderFactory, ToolRegistryFactory, HooksService, TokenizerService],
  exports: [EngineService, ProviderFactory, ToolRegistryFactory, HooksService, TokenizerService],
})
export class EngineModule {}

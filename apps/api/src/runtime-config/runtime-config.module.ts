import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { RuntimeConfigService } from "./runtime-config.service";
import { RuntimeConfigController } from "./runtime-config.controller";
import { RuntimeConfigGateway } from "./runtime-config.gateway";
import { runtimeConfig } from "./runtime.config";

@Module({
  imports: [ConfigModule.forFeature(runtimeConfig)],
  providers: [RuntimeConfigService, RuntimeConfigGateway],
  controllers: [RuntimeConfigController],
  exports: [RuntimeConfigService],
})
export class RuntimeConfigModule {}

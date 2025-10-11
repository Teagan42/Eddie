import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { RuntimeConfigService } from "./runtime-config.service";
import { RuntimeConfigController } from "./runtime-config.controller";
import { RuntimeConfigGateway } from "./runtime-config.gateway";
import { runtimeConfig } from "./runtime.config";
import {
  RUNTIME_CONFIG_STORE,
  createRuntimeConfigStore,
} from "./runtime-config.store";

@Module({
  imports: [ConfigModule.forFeature(runtimeConfig)],
  providers: [
    { provide: RUNTIME_CONFIG_STORE, useFactory: createRuntimeConfigStore },
    RuntimeConfigService,
    RuntimeConfigGateway,
  ],
  controllers: [RuntimeConfigController],
  exports: [RuntimeConfigService],
})
export class RuntimeConfigModule {}

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CqrsModule } from "@nestjs/cqrs";
import { ConfigStore } from "@eddie/config";
import { RuntimeConfigService } from "./runtime-config.service";
import { RuntimeConfigController } from "./runtime-config.controller";
import { RuntimeConfigGateway } from "./runtime-config.gateway";
import { RuntimeConfigGatewayEventsHandler } from "./runtime-config.gateway.events-handler";
import { GetRuntimeConfigHandler } from "./queries/get-runtime-config.handler";
import { UpdateRuntimeConfigHandler } from "./commands/update-runtime-config.handler";
import { runtimeConfig } from "./runtime.config";
import {
  RUNTIME_CONFIG_STORE,
  createRuntimeConfigStore,
} from "./runtime-config.store";

const runtimeConfigCommandHandlers = [UpdateRuntimeConfigHandler];
const runtimeConfigQueryHandlers = [GetRuntimeConfigHandler];
const runtimeConfigEventHandlers = [RuntimeConfigGatewayEventsHandler];

@Module({
  imports: [ConfigModule.forFeature(runtimeConfig), CqrsModule],
  providers: [
    {
      provide: RUNTIME_CONFIG_STORE,
      useFactory: createRuntimeConfigStore,
      inject: [ConfigStore],
    },
    RuntimeConfigService,
    RuntimeConfigGateway,
    ...runtimeConfigEventHandlers,
    ...runtimeConfigQueryHandlers,
    ...runtimeConfigCommandHandlers,
  ],
  controllers: [RuntimeConfigController],
  exports: [RuntimeConfigService],
})
export class RuntimeConfigModule {}

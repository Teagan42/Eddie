import {
  ConfigurableModuleBuilder,
  Global,
  Module,
  Provider,
} from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";

import { eddieConfig } from "./config.namespace";
import { ConfigService } from "./config.service";
import { ConfigWatcher } from "./config-watcher";
import { ConfigStore } from "./hot-config.store";
import type { CliRuntimeOptions } from "./types";

export type ConfigModuleOptions = CliRuntimeOptions;

const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<ConfigModuleOptions>({
    moduleName: "EddieConfigModule",
  }).build();

const configStoreProvider: Provider = {
  provide: ConfigStore,
  useFactory: async (
    configService: ConfigService,
    runtimeOptions: ConfigModuleOptions | undefined
  ) => {
    const store = new ConfigStore();
    configService.bindStore(store);
    await configService.load(runtimeOptions ?? {});
    return store;
  },
  inject: [ConfigService, { token: MODULE_OPTIONS_TOKEN, optional: true }],
};

@Global()
@Module({
  imports: [NestConfigModule.forFeature(eddieConfig)],
  providers: [ConfigService, configStoreProvider, ConfigWatcher],
  exports: [ConfigService, ConfigStore, ConfigWatcher, NestConfigModule],
})
export class ConfigModule extends ConfigurableModuleClass {}

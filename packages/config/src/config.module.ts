import {
  Global,
  Module,
  Provider,
  ConfigurableModuleBuilder,
} from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";

import { eddieConfig } from "./config.namespace";
import { ConfigService } from "./config.service";
import { ConfigStore } from "./hot-config.store";
import { ConfigWatcher } from "./config-watcher";
import type { CliRuntimeOptions } from "./types";

export interface ConfigModuleOptions {
  cliOptions?: CliRuntimeOptions;
}

const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<ConfigModuleOptions>().build();

function resolveCliOverrides(
  moduleOptions?: ConfigModuleOptions | null,
): CliRuntimeOptions {
  return moduleOptions?.cliOptions ?? {};
}

const configStoreProvider: Provider = {
  provide: ConfigStore,
  useFactory: async (
    configService: ConfigService,
    moduleOptions?: ConfigModuleOptions | null,
  ) => {
    const store = new ConfigStore();
    configService.bindStore(store);
    await configService.load(resolveCliOverrides(moduleOptions));
    return store;
  },
  inject: [
    ConfigService,
    { token: MODULE_OPTIONS_TOKEN, optional: true },
  ],
};

@Global()
@Module({
  imports: [NestConfigModule.forFeature(eddieConfig)],
  providers: [ConfigService, configStoreProvider, ConfigWatcher],
  exports: [ConfigService, ConfigStore, ConfigWatcher, NestConfigModule],
})
export class ConfigModule extends ConfigurableModuleClass {}

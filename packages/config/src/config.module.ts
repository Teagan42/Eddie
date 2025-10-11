import {
  Global,
  Module,
  Provider,
  ConfigurableModuleBuilder,
} from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { ConfigStore } from "./config.store";
import { eddieConfig } from "./config.namespace";
import { ConfigService } from "./config.service";
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
export class ConfigModule extends ConfigurableModuleClass {
  static register(
    options: ConfigModuleOptions,
  ): ReturnType<typeof ConfigurableModuleClass["register"]> {
    const dynamicModule = super.register(options);
    return {
      ...dynamicModule,
      providers: [
        ...(dynamicModule.providers ?? []),
        {
          provide: MODULE_OPTIONS_TOKEN,
          useValue: options,
        },
      ],
      exports: [...(dynamicModule.exports ?? []), MODULE_OPTIONS_TOKEN],
      global: true,
    };
  }

  static registerAsync(
    options: Parameters<typeof ConfigurableModuleClass[ "registerAsync" ]>[ 0 ],
  ): ReturnType<typeof ConfigurableModuleClass["registerAsync"]> {
    const dynamicModule = super.registerAsync(options);
    return {
      ...dynamicModule,
      global: true,
    };
  }
}

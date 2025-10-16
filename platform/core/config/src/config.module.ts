import {
  Global,
  Module,
} from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { eddieConfig } from "./config.namespace";
import { ConfigService } from "./config.service";
import { ConfigWatcher } from "./config-watcher";
import { ConfigStore } from './config.store';
import { initialConfigProvider } from "./initial-config.provider";
import type { CliRuntimeOptions } from "./types";
import { CONFIG_FILE_PATH_TOKEN, ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } from './config.const';
import { configFilePathProvider } from "./config-file-path.provider";
import { ConfigValidator } from "./validation/config-validator";


@Global()
@Module({
  imports: [NestConfigModule.forFeature(eddieConfig)],
  providers: [
    configFilePathProvider,
    ConfigService,
    ConfigWatcher,
    initialConfigProvider,
    ConfigStore,
    ConfigValidator,
  ],
  exports: [
    CONFIG_FILE_PATH_TOKEN,
    ConfigService,
    ConfigStore,
    ConfigWatcher,
    ConfigValidator,
    NestConfigModule,
  ],
})
export class ConfigModule extends ConfigurableModuleClass {
  static register(
    options: CliRuntimeOptions,
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

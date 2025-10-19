import type { FactoryProvider } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { ConfigService } from "./config.service";
import { MODULE_OPTIONS_TOKEN, INITIAL_CONFIG_TOKEN, CONFIG_FILE_PATH_TOKEN } from "./config.const";
import { eddieConfig } from "./config.namespace";
import type { CliRuntimeOptions, EddieConfig } from "./types";
import { resolveRuntimeOptions } from "./runtime-env";

export const initialConfigProvider: FactoryProvider<Promise<EddieConfig>> = {
  provide: INITIAL_CONFIG_TOKEN,
  inject: [
    { token: MODULE_OPTIONS_TOKEN, optional: true },
    { token: eddieConfig.KEY, optional: true },
    { token: CONFIG_FILE_PATH_TOKEN, optional: true },
  ],
  useFactory: async (
    moduleOptions?: CliRuntimeOptions,
    defaults?: ConfigType<typeof eddieConfig>,
    configFilePath?: string | null,
  ): Promise<EddieConfig> => {
    const combinedOptions = resolveRuntimeOptions(moduleOptions);
    const service = new ConfigService(
      undefined,
      combinedOptions,
      defaults,
      configFilePath ?? null,
    );

    const { config, input } = await service.readSnapshot();
    if (config) {
      return config;
    }

    return service.compose(input, combinedOptions, { path: configFilePath ?? undefined });
  },
};

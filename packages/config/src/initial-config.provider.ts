import type { FactoryProvider } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { ConfigService } from "./config.service";
import { MODULE_OPTIONS_TOKEN, INITIAL_CONFIG_TOKEN } from "./config.const";
import { eddieConfig } from "./config.namespace";
import type { CliRuntimeOptions, EddieConfig } from "./types";
import { resolveCliRuntimeOptionsFromEnv } from "./runtime-env";
import type { ConfigStore } from "./config.store";

export const initialConfigProvider: FactoryProvider<Promise<EddieConfig>> = {
  provide: INITIAL_CONFIG_TOKEN,
  inject: [
    { token: MODULE_OPTIONS_TOKEN, optional: true },
    { token: eddieConfig.KEY, optional: true },
  ],
  useFactory: async (
    moduleOptions?: CliRuntimeOptions,
    defaults?: ConfigType<typeof eddieConfig>,
  ): Promise<EddieConfig> => {
    const envOptions = resolveCliRuntimeOptionsFromEnv(process.env);
    const service = new ConfigService(
      {
        setSnapshot: () => {
          // Intentionally empty: we do not want to mutate the real store during
          // initial composition.
        },
      } as ConfigStore,
      {
        ...envOptions,
        ...(moduleOptions ?? {}),
      },
      defaults,
    );

    return service.compose({}, {});
  },
};

import type { FactoryProvider } from "@nestjs/common";
import type { CliRuntimeOptions } from "./types";
import { MODULE_OPTIONS_TOKEN, CONFIG_FILE_PATH_TOKEN } from "./config.const";
import { resolveRuntimeOptions } from "./runtime-env";
import { resolveConfigFilePath } from "./config-path";

export const configFilePathProvider: FactoryProvider<Promise<string | null>> = {
  provide: CONFIG_FILE_PATH_TOKEN,
  inject: [
    { token: MODULE_OPTIONS_TOKEN, optional: true },
  ],
  useFactory: async (
    moduleOptions?: CliRuntimeOptions,
  ): Promise<string | null> => {
    const combinedOptions = resolveRuntimeOptions(moduleOptions);

    return resolveConfigFilePath(combinedOptions);
  },
};

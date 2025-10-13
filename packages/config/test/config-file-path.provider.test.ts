import { afterEach, describe, expect, it, vi } from "vitest";

import { configFilePathProvider } from "../src/config-file-path.provider";
import type { CliRuntimeOptions } from "../src/types";
import * as runtimeEnv from "../src/runtime-env";
import * as configPath from "../src/config-path";

describe("configFilePathProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves the config path using merged runtime options", async () => {
    const moduleOptions = { config: "./custom/config.yml" } as CliRuntimeOptions;
    const mergedOptions = { ...moduleOptions, model: "file" } as CliRuntimeOptions;

    const resolveRuntimeOptions = vi
      .spyOn(runtimeEnv, "resolveRuntimeOptions")
      .mockReturnValue(mergedOptions);
    const resolveConfigFilePath = vi
      .spyOn(configPath, "resolveConfigFilePath")
      .mockResolvedValue("/absolute/config.yml");

    const factory = configFilePathProvider.useFactory!;
    const result = await factory(moduleOptions);

    expect(resolveRuntimeOptions).toHaveBeenCalledWith(moduleOptions);
    expect(resolveConfigFilePath).toHaveBeenCalledWith(mergedOptions);
    expect(result).toBe("/absolute/config.yml");
  });

  it("returns null when no config file is found", async () => {
    vi.spyOn(runtimeEnv, "resolveRuntimeOptions").mockReturnValue({} as CliRuntimeOptions);
    vi.spyOn(configPath, "resolveConfigFilePath").mockResolvedValue(null);

    const factory = configFilePathProvider.useFactory!;
    const result = await factory();

    expect(result).toBeNull();
  });
});

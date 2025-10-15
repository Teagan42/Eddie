import type { EddieConfigInput } from "../types";
import { apiHostPreset } from "./api-host";
import { cliLocalPreset } from "./cli-local";

export const CONFIG_PRESETS = Object.freeze({
  "api-host": apiHostPreset,
  "cli-local": cliLocalPreset,
}) satisfies Record<string, EddieConfigInput>;

export type ConfigPresetName = keyof typeof CONFIG_PRESETS;

export const CONFIG_PRESET_NAMES = Object.freeze(
  Object.keys(CONFIG_PRESETS) as ConfigPresetName[],
);

export function getConfigPreset(
  name: string | undefined,
): EddieConfigInput | undefined {
  if (!name) {
    return undefined;
  }

  const preset = CONFIG_PRESETS[name as ConfigPresetName];
  if (!preset) {
    return undefined;
  }

  return structuredClone(preset);
}

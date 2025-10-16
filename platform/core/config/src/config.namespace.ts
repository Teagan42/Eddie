import { registerAs } from "@nestjs/config";
import { DEFAULT_CONFIG } from "./defaults";
import type { EddieConfig } from "./types";

export const CONFIG_NAMESPACE = "eddie" as const;

export const eddieConfig = registerAs(
  CONFIG_NAMESPACE,
  (): EddieConfig => structuredClone(DEFAULT_CONFIG)
);

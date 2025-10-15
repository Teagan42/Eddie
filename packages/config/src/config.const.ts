import { ConfigurableModuleBuilder } from "@nestjs/common";
import { CliRuntimeOptions } from "./types";

const configurableModule =
  new ConfigurableModuleBuilder<CliRuntimeOptions>().build();

export const { ConfigurableModuleClass } = configurableModule;

/**
 * Provides the module options token for CLI runtime configuration.
 * Expects a CliRuntimeOptions object describing runtime defaults.
 * Typically injected into ConfigurableModuleClass factories to supply CLI runtime configuration.
 */
export const { MODULE_OPTIONS_TOKEN } = configurableModule;

/**
 * Provides the token for the initial CLI configuration snapshot.
 * Expects a CliRuntimeOptions object produced during bootstrap resolution.
 * Typically injected into services that need the baseline configuration values.
 */
export const INITIAL_CONFIG_TOKEN = Symbol("EDDIE_INITIAL_CONFIG");

/**
 * Provides the token for the resolved CLI configuration file path.
 * Expects a string containing the absolute path to the active configuration file.
 * Typically injected into watchers and diagnostics reporting configuration provenance.
 */
export const CONFIG_FILE_PATH_TOKEN = Symbol("EDDIE_CONFIG_FILE_PATH");

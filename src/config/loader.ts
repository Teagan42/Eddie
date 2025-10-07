import fs from "fs/promises";
import path from "path";
import yaml from "yaml";
import { DEFAULT_CONFIG } from "./defaults";
import type {
  CliRuntimeOptions,
  ContextConfig,
  EddieConfig,
  EddieConfigInput,
} from "./types";

const CONFIG_FILENAMES = [
  "eddie.config.json",
  "eddie.config.yaml",
  "eddie.config.yml",
  ".eddierc",
  ".eddierc.json",
  ".eddierc.yaml",
];

async function readConfigFile(candidate: string): Promise<EddieConfigInput> {
  try {
    const data = await fs.readFile(candidate, "utf-8");
    if (candidate.endsWith(".yaml") || candidate.endsWith(".yml")) {
      return (yaml.parse(data) ?? {}) as EddieConfigInput;
    }
    if (candidate.endsWith(".json") || candidate.endsWith(".rc")) {
      return JSON.parse(data) as EddieConfigInput;
    }
    try {
      return (yaml.parse(data) ?? {}) as EddieConfigInput;
    } catch {
      return JSON.parse(data) as EddieConfigInput;
    }
  } catch {
    return {};
  }
}

async function resolveConfigPath(
  options: CliRuntimeOptions
): Promise<string | null> {
  if (options.config) {
    const explicit = path.resolve(options.config);
    try {
      await fs.access(explicit);
      return explicit;
    } catch {
      throw new Error(`Config file not found at ${explicit}`);
    }
  }

  for (const name of CONFIG_FILENAMES) {
    const candidate = path.resolve(name);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // keep searching
    }
  }

  return null;
}

function ensureContextShape(context: ContextConfig | undefined): ContextConfig {
  return {
    include: context?.include ?? [],
    exclude: context?.exclude,
    baseDir: context?.baseDir ?? process.cwd(),
    maxBytes: context?.maxBytes,
    maxFiles: context?.maxFiles,
  };
}

function mergeConfig(
  base: EddieConfig,
  input: EddieConfigInput
): EddieConfig {
  const mergedContext = ensureContextShape({
    ...base.context,
    ...(input.context ?? {}),
  });

  return {
    ...base,
    ...(input.model ? { model: input.model } : {}),
    ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
    ...(input.logLevel ? { logLevel: input.logLevel } : {}),
    provider: {
      ...base.provider,
      ...(input.provider ?? {}),
    },
    context: mergedContext,
    output: {
      ...base.output,
      ...(input.output ?? {}),
    },
    tools: {
      ...base.tools,
      ...(input.tools ?? {}),
    },
    hooks: {
      ...base.hooks,
      ...(input.hooks ?? {}),
    },
    tokenizer: {
      ...base.tokenizer,
      ...(input.tokenizer ?? {}),
    },
  };
}

function applyCliOverrides(
  config: EddieConfig,
  options: CliRuntimeOptions
): EddieConfig {
  const merged = { ...config };

  if (options.model) {
    merged.model = options.model;
  }

  if (options.provider) {
    merged.provider = {
      ...merged.provider,
      name: options.provider,
    };
  }

  if (options.context?.length) {
    merged.context = {
      ...merged.context,
      include: options.context,
    };
  }

  if (options.tools?.length) {
    merged.tools = {
      ...(merged.tools ?? {}),
      enabled: options.tools,
    };
  }

  if (typeof options.autoApprove === "boolean") {
    merged.tools = {
      ...(merged.tools ?? {}),
      autoApprove: options.autoApprove,
    };
  }

  if (options.jsonlTrace) {
    merged.output = {
      ...(merged.output ?? {}),
      jsonlTrace: options.jsonlTrace,
    };
  }

  return merged;
}

export async function loadConfig(
  options: CliRuntimeOptions
): Promise<EddieConfig> {
  const configPath = await resolveConfigPath(options);
  const fileConfig = configPath ? await readConfigFile(configPath) : {};
  const merged = mergeConfig(DEFAULT_CONFIG, fileConfig);
  return applyCliOverrides(merged, options);
}

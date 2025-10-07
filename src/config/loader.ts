import { Injectable } from "@nestjs/common";
import fs from "fs/promises";
import path from "path";
import yaml from "yaml";
import { DEFAULT_CONFIG } from "./defaults";
import type {
  CliRuntimeOptions,
  ContextConfig,
  EddieConfig,
  EddieConfigInput,
  LoggingConfig,
} from "./types";

const CONFIG_FILENAMES = [
  "eddie.config.json",
  "eddie.config.yaml",
  "eddie.config.yml",
  ".eddierc",
  ".eddierc.json",
  ".eddierc.yaml",
];

@Injectable()
export class ConfigService {
  async load(options: CliRuntimeOptions): Promise<EddieConfig> {
    const configPath = await this.resolveConfigPath(options);
    const fileConfig = configPath ? await this.readConfigFile(configPath) : {};
    const merged = this.mergeConfig(DEFAULT_CONFIG, fileConfig);
    if (merged.logging?.level) {
      merged.logLevel = merged.logging.level;
    } else if (merged.logLevel) {
      merged.logging = {
        ...(merged.logging ?? {}),
        level: merged.logLevel,
      };
    }
    return this.applyCliOverrides(merged, options);
  }

  private async readConfigFile(candidate: string): Promise<EddieConfigInput> {
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

  private async resolveConfigPath(
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

  private ensureContextShape(
    context: ContextConfig | undefined
  ): ContextConfig {
    return {
      include: context?.include ?? [],
      exclude: context?.exclude,
      baseDir: context?.baseDir ?? process.cwd(),
      maxBytes: context?.maxBytes,
      maxFiles: context?.maxFiles,
    };
  }

  private mergeConfig(
    base: EddieConfig,
    input: EddieConfigInput
  ): EddieConfig {
    const mergedContext = this.ensureContextShape({
      ...base.context,
      ...(input.context ?? {}),
    });

    const mergedLogging: LoggingConfig = {
      level: base.logging?.level ?? base.logLevel,
      destination: base.logging?.destination,
      enableTimestamps: base.logging?.enableTimestamps,
    };

    if (input.logging?.destination) {
      mergedLogging.destination = {
        ...mergedLogging.destination,
        ...input.logging.destination,
      };
    }

    if (typeof input.logging?.enableTimestamps !== "undefined") {
      mergedLogging.enableTimestamps = input.logging.enableTimestamps;
    }

    const loggingLevel =
      input.logging?.level ?? input.logLevel ?? mergedLogging.level;
    const effectiveLevel = loggingLevel ?? base.logLevel;
    mergedLogging.level = effectiveLevel;

    return {
      ...base,
      ...(input.model ? { model: input.model } : {}),
      ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
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
      logging: mergedLogging,
      logLevel: effectiveLevel,
    };
  }

  private applyCliOverrides(
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

    if (options.logLevel) {
      merged.logLevel = options.logLevel;
      merged.logging = {
        ...(merged.logging ?? { level: options.logLevel }),
        level: options.logLevel,
      };
    } else if (merged.logging?.level) {
      merged.logLevel = merged.logging.level;
    }

    if (options.logFile) {
      const destination = {
        ...(merged.logging?.destination ?? {}),
        type: "file" as const,
        path: options.logFile,
        pretty: false,
        colorize: false,
      };
      merged.logging = {
        ...(merged.logging ?? { level: merged.logLevel }),
        destination,
      };
    }

    return merged;
  }
}

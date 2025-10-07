import { Injectable } from "@nestjs/common";
import fs from "fs/promises";
import path from "path";
import yaml from "yaml";
import { DEFAULT_CONFIG } from "./defaults";
import type {
  AgentsConfig,
  AgentsConfigInput,
  CliRuntimeOptions,
  ContextConfig,
  EddieConfig,
  EddieConfigInput,
  LoggingConfig,
  ToolsConfig,
} from "./types";

const CONFIG_FILENAMES = [
  "eddie.config.json",
  "eddie.config.yaml",
  "eddie.config.yml",
  ".eddierc",
  ".eddierc.json",
  ".eddierc.yaml",
];

/**
 * ConfigService resolves Eddie configuration from disk and merges it with CLI
 * runtime overrides, normalising legacy fields along the way.
 */
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
    merged.agents = this.ensureAgentsShape(
      merged.agents,
      merged.systemPrompt
    );

    const withCli = this.applyCliOverrides(merged, options);
    const finalConfig: EddieConfig = {
      ...withCli,
      agents: this.ensureAgentsShape(
        withCli.agents,
        withCli.systemPrompt
      ),
    };

    this.validateConfig(finalConfig);

    return finalConfig;
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

    const systemPrompt = input.systemPrompt ?? base.systemPrompt;
    const mergedAgents = this.mergeAgents(
      base.agents,
      input.agents,
      systemPrompt
    );

    return {
      ...base,
      ...(input.model ? { model: input.model } : {}),
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
      systemPrompt,
      agents: mergedAgents,
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

    const agents = this.ensureAgentsShape(
      merged.agents,
      merged.systemPrompt
    );

    if (options.agentMode) {
      agents.mode = options.agentMode;
    }

    if (typeof options.disableSubagents === "boolean") {
      agents.enableSubagents = !options.disableSubagents;
    }

    merged.agents = agents;

    return merged;
  }

  private mergeAgents(
    base: AgentsConfig | undefined,
    input: AgentsConfigInput | undefined,
    fallbackPrompt: string
  ): AgentsConfig {
    const normalizedBase = this.ensureAgentsShape(base, fallbackPrompt);
    if (!input) {
      return normalizedBase;
    }

    const manager = {
      ...normalizedBase.manager,
      ...(input.manager ?? {}),
    };

    const promptProvided =
      input?.manager !== undefined &&
      Object.prototype.hasOwnProperty.call(input.manager, "prompt");

    if (
      !promptProvided ||
      typeof manager.prompt !== "string" ||
      manager.prompt.trim() === ""
    ) {
      manager.prompt = fallbackPrompt;
    }

    const routing =
      input.routing || normalizedBase.routing
        ? {
            ...(normalizedBase.routing ?? {}),
            ...(input.routing ?? {}),
          }
        : undefined;

    const subagents =
      input.subagents !== undefined
        ? [...input.subagents]
        : normalizedBase.subagents;

    const enableSubagents =
      typeof input.enableSubagents === "boolean"
        ? input.enableSubagents
        : normalizedBase.enableSubagents;

    const mode = input.mode ?? normalizedBase.mode;

    return this.ensureAgentsShape(
      {
        mode,
        manager: manager as AgentsConfig["manager"],
        subagents,
        routing,
        enableSubagents,
      },
      fallbackPrompt
    );
  }

  private ensureAgentsShape(
    agents: AgentsConfig | undefined,
    fallbackPrompt: string
  ): AgentsConfig {
    const manager = {
      ...(agents?.manager ?? {}),
    } as AgentsConfig["manager"];

    if (typeof manager.prompt !== "string" || manager.prompt.trim() === "") {
      manager.prompt = fallbackPrompt;
    }

    const subagents = agents?.subagents
      ? agents.subagents.map((agent) => ({ ...agent }))
      : [];

    const routing =
      agents?.routing && Object.keys(agents.routing).length > 0
        ? { ...agents.routing }
        : undefined;

    return {
      mode: agents?.mode ?? "single",
      manager,
      subagents,
      routing,
      enableSubagents:
        typeof agents?.enableSubagents === "boolean"
          ? agents.enableSubagents
          : true,
    };
  }

  private validateConfig(config: EddieConfig): void {
    this.validateToolsConfig(config.tools);

    const { agents } = config;

    if (!agents) {
      return;
    }

    if (typeof agents.mode !== "string" || agents.mode.trim() === "") {
      throw new Error("agents.mode must be a non-empty string.");
    }

    if (
      !agents.manager ||
      typeof agents.manager.prompt !== "string" ||
      agents.manager.prompt.trim() === ""
    ) {
      throw new Error(
        "agents.manager.prompt must be provided as a non-empty string."
      );
    }

    if (typeof agents.enableSubagents !== "boolean") {
      throw new Error("agents.enableSubagents must be a boolean.");
    }

    if (!Array.isArray(agents.subagents)) {
      throw new Error("agents.subagents must be an array.");
    }

    agents.subagents.forEach((subagent, index) => {
      if (!subagent || typeof subagent !== "object") {
        throw new Error(`agents.subagents[${index}] must be an object.`);
      }

      if (typeof subagent.id !== "string" || subagent.id.trim() === "") {
        throw new Error(
          `agents.subagents[${index}].id must be a non-empty string.`
        );
      }

      if (
        typeof subagent.prompt !== "undefined" &&
        typeof subagent.prompt !== "string"
      ) {
        throw new Error(
          `agents.subagents[${index}].prompt must be a string when provided.`
        );
      }

      if (
        typeof subagent.name !== "undefined" &&
        typeof subagent.name !== "string"
      ) {
        throw new Error(
          `agents.subagents[${index}].name must be a string when provided.`
        );
      }

      if (
        typeof subagent.description !== "undefined" &&
        typeof subagent.description !== "string"
      ) {
        throw new Error(
          `agents.subagents[${index}].description must be a string when provided.`
        );
      }

      if (
        typeof subagent.tools !== "undefined" &&
        (!Array.isArray(subagent.tools) ||
          subagent.tools.some((tool) => typeof tool !== "string"))
      ) {
        throw new Error(
          `agents.subagents[${index}].tools must be an array of strings when provided.`
        );
      }

      if (
        typeof subagent.routingThreshold !== "undefined" &&
        typeof subagent.routingThreshold !== "number"
      ) {
        throw new Error(
          `agents.subagents[${index}].routingThreshold must be a number when provided.`
        );
      }
    });

    if (agents.routing) {
      const { confidenceThreshold, maxDepth } = agents.routing;

      if (typeof confidenceThreshold !== "undefined") {
        if (
          typeof confidenceThreshold !== "number" ||
          Number.isNaN(confidenceThreshold) ||
          confidenceThreshold < 0 ||
          confidenceThreshold > 1
        ) {
          throw new Error(
            "agents.routing.confidenceThreshold must be a number between 0 and 1."
          );
        }
      }

      if (typeof maxDepth !== "undefined") {
        if (
          typeof maxDepth !== "number" ||
          Number.isNaN(maxDepth) ||
          !Number.isInteger(maxDepth) ||
          maxDepth < 0
        ) {
          throw new Error(
            "agents.routing.maxDepth must be a non-negative integer when provided."
          );
        }
      }
    }
  }

  private validateToolsConfig(tools: ToolsConfig | undefined): void {
    if (!tools?.sources) {
      return;
    }

    if (!Array.isArray(tools.sources)) {
      throw new Error("tools.sources must be an array when provided.");
    }

    tools.sources.forEach((source, index) => {
      if (!source || typeof source !== "object") {
        throw new Error(`tools.sources[${index}] must be an object.`);
      }

      if (source.type !== "mcp") {
        throw new Error(
          `tools.sources[${index}].type must be the literal string "mcp".`
        );
      }

      if (typeof source.id !== "string" || source.id.trim() === "") {
        throw new Error(
          `tools.sources[${index}].id must be provided as a non-empty string.`
        );
      }

      if (typeof source.url !== "string" || source.url.trim() === "") {
        throw new Error(
          `tools.sources[${index}].url must be provided as a non-empty string.`
        );
      }

      if (
        typeof source.name !== "undefined" &&
        (typeof source.name !== "string" || source.name.trim() === "")
      ) {
        throw new Error(
          `tools.sources[${index}].name must be a non-empty string when provided.`
        );
      }

      if (typeof source.headers !== "undefined") {
        if (
          !source.headers ||
          typeof source.headers !== "object" ||
          Array.isArray(source.headers)
        ) {
          throw new Error(
            `tools.sources[${index}].headers must be an object with string values when provided.`
          );
        }

        for (const [key, value] of Object.entries(source.headers)) {
          if (typeof value !== "string") {
            throw new Error(
              `tools.sources[${index}].headers.${key} must be a string.`
            );
          }
        }
      }

      if (typeof source.auth !== "undefined") {
        const auth = source.auth;
        if (!auth || typeof auth !== "object") {
          throw new Error(
            `tools.sources[${index}].auth must be an object when provided.`
          );
        }

        if (auth.type === "basic") {
          if (
            typeof auth.username !== "string" ||
            auth.username.trim() === "" ||
            typeof auth.password !== "string"
          ) {
            throw new Error(
              `tools.sources[${index}].auth must include non-empty username and password for basic auth.`
            );
          }
        } else if (auth.type === "bearer") {
          if (typeof auth.token !== "string" || auth.token.trim() === "") {
            throw new Error(
              `tools.sources[${index}].auth.token must be a non-empty string for bearer auth.`
            );
          }
        } else if (auth.type === "none") {
          // nothing additional
        } else {
          throw new Error(
            `tools.sources[${index}].auth.type must be one of "basic", "bearer", or "none".`
          );
        }
      }

      if (
        typeof source.capabilities !== "undefined" &&
        (typeof source.capabilities !== "object" ||
          source.capabilities === null ||
          Array.isArray(source.capabilities))
      ) {
        throw new Error(
          `tools.sources[${index}].capabilities must be an object when provided.`
        );
      }
    });
  }
}

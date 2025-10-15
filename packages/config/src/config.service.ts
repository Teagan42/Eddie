import { forwardRef, Inject, Injectable, Logger, Optional } from "@nestjs/common";
import {
  ConfigType,
} from "@nestjs/config";
import fs from "fs/promises";
import path from "path";
import { Subject } from "rxjs";
import yaml from "yaml";
import { ConfigValidator } from "./validation/config-validator";
import { CURRENT_CONFIG_VERSION, runConfigMigrations } from "./migrations";
import { CONFIG_FILE_PATH_TOKEN, MODULE_OPTIONS_TOKEN } from './config.const';
import { eddieConfig } from "./config.namespace";
import { ConfigStore } from './config.store';
import { DEFAULT_CONFIG } from "./defaults";
import { getConfigRoot, resolveConfigFilePath } from "./config-path";
import { CONFIG_PRESET_NAMES, getConfigPreset } from "./presets";
import type {
  AgentsConfig,
  AgentsConfigInput,
  ApiConfig,
  CliRuntimeOptions,
  ContextConfig,
  ContextResourceConfig,
  EddieConfig,
  EddieConfigInput,
  LoggingConfig,
  ProviderConfig,
  ProviderProfileConfig,
  TranscriptConfig,
} from "./types";

export type ConfigFileFormat = "yaml" | "json";

export interface ConfigFileSnapshot {
  path: string | null;
  format: ConfigFileFormat;
  content: string;
  input: EddieConfigInput;
  config?: EddieConfig;
  error?: string;
}

/**
 * ConfigService resolves Eddie configuration from disk and merges it with CLI
 * runtime overrides, normalising legacy fields along the way.
 */
@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);
  private readonly writeSubject = new Subject<ConfigFileSnapshot>();

  readonly writes$ = this.writeSubject.asObservable();

  private readonly moduleOptions: CliRuntimeOptions;
  private readonly configFilePath: string | null;
  private readonly validator: ConfigValidator;

  constructor(
    @Optional()
    @Inject(forwardRef(() => ConfigStore))
    private readonly configStore?: ConfigStore,
    @Optional()
    @Inject(MODULE_OPTIONS_TOKEN)
    moduleOptions?: CliRuntimeOptions,
    @Optional()
    @Inject(eddieConfig.KEY)
    private readonly defaultsProvider?: ConfigType<typeof eddieConfig>,
    @Optional()
    @Inject(CONFIG_FILE_PATH_TOKEN)
    configFilePath?: string | null,
    @Optional()
    validator?: ConfigValidator,
  ) {
    this.moduleOptions = moduleOptions ?? {};
    this.configFilePath = configFilePath ?? null;
    this.validator = validator ?? new ConfigValidator();
  }

  async load(options: CliRuntimeOptions): Promise<EddieConfig> {
    const configPath = await resolveConfigFilePath(options);
    const fileConfig = configPath ? await this.readConfigFile(configPath) : {};
    const config = await this.compose(fileConfig, options);
    if (this.configStore) {
      this.configStore.setSnapshot(config);
      return this.configStore.getSnapshot();
    }
    return config;
  }

  async compose(
    input: EddieConfigInput,
    options: CliRuntimeOptions = {}
  ): Promise<EddieConfig> {
    const currentVersion = CURRENT_CONFIG_VERSION;
    const candidateVersion = input.version;
    if (
      typeof candidateVersion === "number" &&
      candidateVersion > currentVersion
    ) {
      throw new Error(
        `This config declares newer config version ${candidateVersion} than supported version ${currentVersion}.`,
      );
    }

    const { migrated, finalVersion, initialVersion, warnings } =
      runConfigMigrations(input);
    if (finalVersion !== currentVersion) {
      throw new Error(
        `Unable to automatically migrate config version ${initialVersion} to ${currentVersion}.`,
      );
    }

    warnings.forEach((warning) => {
      this.logger.warn(`[Config migration] ${warning}`);
    });

    const migratedInput = migrated;

    const mergedOverrides = {
      ...this.moduleOptions,
      ...this.removeUndefinedCliOverrides(options),
    };
    const defaultsWithPreset = this.applyPreset(
      this.resolveDefaultConfig(),
      mergedOverrides.preset,
    );

    const finalConfig = this.composeLayers(
      defaultsWithPreset,
      migratedInput,
      mergedOverrides,
    );

    this.validator.validate(finalConfig);

    return {
      ...finalConfig,
      version: currentVersion,
    };
  }

  private composeLayers(
    defaults: EddieConfig,
    fileInput: EddieConfigInput,
    cliOverrides: CliRuntimeOptions,
  ): EddieConfig {
    // Precedence: provider defaults → config file → CLI overrides.
    const withFileLayer = this.applyConfigFileOverrides(defaults, fileInput);
    const normalisedFileLayer = this.normalizeConfig(withFileLayer);
    const withCliLayer = this.applyCliOverrides(normalisedFileLayer, cliOverrides);
    return this.normalizeConfig(withCliLayer);
  }

  private applyPreset(
    defaults: EddieConfig,
    presetName: string | undefined,
  ): EddieConfig {
    if (!presetName) {
      return defaults;
    }

    const preset = getConfigPreset(presetName);
    if (!preset) {
      const available = CONFIG_PRESET_NAMES.join(", ");
      const parts = [`Unknown configuration preset: ${presetName}.`];
      if (available) {
        parts.push(`Available presets: ${available}.`);
      }
      parts.push("Use --preset <name> to apply a preset.");
      throw new Error(parts.join(" "));
    }

    return this.applyConfigFileOverrides(defaults, preset);
  }

  private removeUndefinedCliOverrides(
    options: CliRuntimeOptions,
  ): CliRuntimeOptions {
    if (!Object.values(options).some((value) => value === undefined)) {
      return options;
    }

    const entries = Object.entries(options).filter(([, value]) => value !== undefined);
    return Object.fromEntries(entries) as CliRuntimeOptions;
  }

  private resolveProjectDir(
    candidate: string | undefined,
    fallback: string
  ): string {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate;
    }
    return fallback;
  }

  private resolveDefaultConfig(): EddieConfig {
    // Start from provider-supplied defaults when available. This makes the
    // defaultsProvider the initial base that will then be overwritten by any
    // on-disk config and finally by CLI options (the desired precedence).
    const namespaced = this.readNamespacedDefaults();
    if (namespaced) {
      // structuredClone to avoid accidental mutation of the injected provider
      return structuredClone(namespaced) as EddieConfig;
    }

    return structuredClone(DEFAULT_CONFIG);
  }

  private readNamespacedDefaults(): EddieConfig | EddieConfigInput | undefined {
    if (this.defaultsProvider) {
      return this.defaultsProvider;
    }

    return undefined;
  }

  async readSnapshot(): Promise<ConfigFileSnapshot> {
    const configPath = this.configFilePath;
    const format = configPath ? this.detectFormat(configPath) : "yaml";

    let content: string;
    let input: EddieConfigInput;

    if (configPath) {
      content = await fs.readFile(configPath, "utf-8");
      input = await this.readConfigFile(configPath);
    } else {
      content = yaml.stringify(DEFAULT_CONFIG);
      input = this.parseSource(content, "yaml");
    }

    let config: EddieConfig | undefined;
    let error: string | undefined;

    try {
      config = await this.compose(input, this.moduleOptions);
    } catch (composeError) {
      error = composeError instanceof Error
        ? composeError.message
        : "Unable to compose configuration.";
    }

    return {
      path: configPath,
      format,
      content,
      input,
      config,
      error,
    };
  }

  async writeSource(
    source: string,
    format: ConfigFileFormat,
    options: CliRuntimeOptions = {},
    targetPath?: string | null
  ): Promise<ConfigFileSnapshot> {
    const configRoot = getConfigRoot();
    let resolvedTarget: string | null | undefined;
    if (targetPath) {
      if (path.isAbsolute(targetPath)) {
        throw new Error("Invalid target path: must be relative to config directory.");
      }

      const normalisedTarget = path.normalize(targetPath);
      if (
        normalisedTarget.startsWith("..") ||
        normalisedTarget.includes(`${path.sep}..`) ||
        normalisedTarget === ".."
      ) {
        throw new Error("Invalid target path: outside of config directory.");
      }

      const candidate = path.join(configRoot, normalisedTarget);
      if (
        candidate !== configRoot &&
        !candidate.startsWith(configRoot + path.sep)
      ) {
        throw new Error("Invalid target path: outside of config directory.");
      }

      resolvedTarget = candidate;
    } else {
      resolvedTarget = await resolveConfigFilePath(options);
    }

    const destination =
      resolvedTarget ??
      path.resolve(
        configRoot,
        format === "json" ? "eddie.config.json" : "eddie.config.yaml"
      );

    const input = this.parseSource(source, format);
    const config = await this.compose(input, options);
    const serialized = this.serializeInput(input, format);

    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, serialized, "utf-8");

    this.configStore?.setSnapshot(config);

    const snapshot: ConfigFileSnapshot = {
      path: destination,
      format,
      content: serialized,
      input,
      config,
    };

    this.writeSubject.next(snapshot);

    return snapshot;
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

  parseSource(source: string, format: ConfigFileFormat): EddieConfigInput {
    const content = source.trim();
    if (!content) {
      return {};
    }

    if (format === "json") {
      const parsed = JSON.parse(source) as unknown;
      if (!this.isPlainObject(parsed)) {
        throw new Error("Configuration JSON must represent an object.");
      }
      return parsed as EddieConfigInput;
    }

    const parsed = yaml.parse(source) ?? {};
    if (!this.isPlainObject(parsed)) {
      throw new Error("Configuration YAML must represent an object.");
    }
    return parsed as EddieConfigInput;
  }

  serializeInput(
    input: EddieConfigInput,
    format: ConfigFileFormat
  ): string {
    const normalized = this.isPlainObject(input) ? input : {};
    if (format === "json") {
      return `${JSON.stringify(normalized, null, 2)}\n`;
    }
    return yaml.stringify(normalized);
  }

  private detectFormat(candidate: string): ConfigFileFormat {
    const lower = candidate.toLowerCase();
    if (lower.endsWith(".json") || lower.endsWith(".rc")) {
      return "json";
    }
    return "yaml";
  }

  private ensureContextShape(
    contextInput: Partial<ContextConfig> | undefined,
    fallbackProjectDir: string
  ): ContextConfig {
    const include = contextInput?.include ? [...contextInput.include] : [];
    const exclude = contextInput?.exclude
      ? [...contextInput.exclude]
      : undefined;
    const variables = contextInput?.variables
      ? { ...contextInput.variables }
      : undefined;
    const resources = contextInput?.resources
      ? contextInput.resources.map((resource) => this.cloneResourceConfig(resource))
      : undefined;

    return {
      include,
      exclude,
      baseDir: contextInput?.baseDir ?? fallbackProjectDir,
      maxBytes: contextInput?.maxBytes,
      maxFiles: contextInput?.maxFiles,
      variables,
      resources,
    };
  }

  private applyConfigFileOverrides(
    base: EddieConfig,
    input: EddieConfigInput
  ): EddieConfig {
    const nextProjectDir = this.resolveProjectDir(
      input.projectDir,
      base.projectDir
    );

    const contextOverrides: Partial<ContextConfig> = {
      ...base.context,
      ...(input.context ?? {}),
    };

    if (!input.context || typeof input.context.baseDir === "undefined") {
      delete contextOverrides.baseDir;
    }

    const mergedContext = this.ensureContextShape(
      contextOverrides,
      nextProjectDir
    );

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

    const providers = this.mergeProviders(base.providers, input.providers);
    const provider = this.mergeProviderConfig(
      base.provider,
      input.provider
    );
    const mergedApi = this.mergeApiConfig(base.api, input.api);

    return {
      ...base,
      ...(input.model ? { model: input.model } : {}),
      projectDir: nextProjectDir,
      provider,
      providers,
      context: mergedContext,
      api: mergedApi,
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
      transcript: this.mergeTranscriptConfig(
        base.transcript,
        input.transcript,
      ),
    };
  }

  private normalizeConfig(config: EddieConfig): EddieConfig {
    const logging = this.normalizeLogging(config);
    const projectDir = this.resolveProjectDir(
      config.projectDir,
      process.cwd()
    );
    const context = this.ensureContextShape(config.context, projectDir);
    return {
      ...config,
      ...logging,
      projectDir,
      context,
      agents: this.applyAgentsBaseDir(
        this.ensureAgentsShape(config.agents, config.systemPrompt),
        projectDir
      ),
    };
  }

  private normalizeLogging(
    config: EddieConfig
  ): Pick<EddieConfig, "logLevel" | "logging"> {
    const logging = config.logging ? { ...config.logging } : undefined;
    const logLevel = logging?.level ?? config.logLevel;

    if (logging) {
      if (logLevel && logging.level !== logLevel) {
        logging.level = logLevel;
      }
      return {
        logLevel,
        logging,
      };
    }

    if (logLevel) {
      return {
        logLevel,
        logging: { level: logLevel },
      };
    }

    return {
      logLevel,
      logging,
    };
  }

  private applyCliOverrides(
    config: EddieConfig,
    options: CliRuntimeOptions
  ): EddieConfig {
    const merged: EddieConfig = {
      ...config,
      provider: this.cloneProviderConfig(config.provider),
      providers: this.mergeProviders(undefined, config.providers),
      transcript: this.cloneTranscriptConfig(config.transcript),
    };

    if (options.provider) {
      const profile = merged.providers?.[options.provider];
      if (profile) {
        merged.provider = this.cloneProviderConfig(profile.provider);
        if (profile.model) {
          merged.model = profile.model;
        }
      } else {
        merged.provider = this.mergeProviderConfig(merged.provider, {
          name: options.provider,
        });
      }
    }

    if (options.model) {
      merged.model = options.model;
    }

    if (options.disableContext) {
      merged.context = {
        ...merged.context,
        include: [],
        resources: [],
        maxBytes: 0,
        maxFiles: 0,
      };
    } else if (options.context?.length) {
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

    if (options.disabledTools?.length) {
      merged.tools = {
        ...(merged.tools ?? {}),
        disabled: options.disabledTools,
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

    manager.transcript = this.mergeTranscriptConfig(
      normalizedBase.manager.transcript,
      input.manager?.transcript,
    );

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

  private mergeTranscriptConfig(
    base: TranscriptConfig | undefined,
    input: TranscriptConfig | undefined,
  ): TranscriptConfig | undefined {
    if (!base && !input) {
      return undefined;
    }

    const normalizedBase = this.cloneTranscriptConfig(base);

    if (!input?.compactor) {
      return normalizedBase;
    }

    const merged: TranscriptConfig = {
      compactor: {
        ...(normalizedBase?.compactor ?? {}),
        ...input.compactor,
      },
    };

    return merged;
  }

  private ensureAgentsShape(
    agents: AgentsConfig | undefined,
    fallbackPrompt: string
  ): AgentsConfig {
    const manager = {
      ...(agents?.manager ?? {}),
    } as AgentsConfig["manager"];

    if (manager.promptTemplate) {
      manager.promptTemplate = { ...manager.promptTemplate };
    }

    if (manager.defaultUserPromptTemplate) {
      manager.defaultUserPromptTemplate = {
        ...manager.defaultUserPromptTemplate,
      };
    }

    if (manager.variables) {
      manager.variables = { ...manager.variables };
    }

    if (manager.resources) {
      manager.resources = manager.resources.map((resource) =>
        this.cloneResourceConfig(resource)
      );
    }

    if (manager.transcript) {
      manager.transcript = this.cloneTranscriptConfig(manager.transcript);
    }

    if (
      manager.provider &&
      typeof manager.provider === "object" &&
      !Array.isArray(manager.provider)
    ) {
      manager.provider = { ...manager.provider };
    }

    if (typeof manager.prompt !== "string" || manager.prompt.trim() === "") {
      manager.prompt = fallbackPrompt;
    }

    const subagents = agents?.subagents
      ? agents.subagents.map((agent) => {
        const cloned = { ...agent };

        if (agent.promptTemplate) {
          cloned.promptTemplate = { ...agent.promptTemplate };
        }

        if (agent.defaultUserPromptTemplate) {
          cloned.defaultUserPromptTemplate = {
            ...agent.defaultUserPromptTemplate,
          };
        }

        if (agent.variables) {
          cloned.variables = { ...agent.variables };
        }

        if (agent.resources) {
          cloned.resources = agent.resources.map((resource) =>
            this.cloneResourceConfig(resource)
          );
        }

        if (
          agent.provider &&
            typeof agent.provider === "object" &&
            !Array.isArray(agent.provider)
        ) {
          cloned.provider = { ...agent.provider };
        }

        if (agent.transcript) {
          cloned.transcript = this.cloneTranscriptConfig(agent.transcript);
        }

        return cloned;
      })
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

  private applyAgentsBaseDir(
    agents: AgentsConfig,
    baseDir: string
  ): AgentsConfig {
    const manager = { ...agents.manager };

    manager.promptTemplate = this.applyTemplateBaseDir(
      manager.promptTemplate,
      baseDir
    );

    manager.defaultUserPromptTemplate = this.applyTemplateBaseDir(
      manager.defaultUserPromptTemplate,
      baseDir
    );

    if (manager.resources) {
      manager.resources = manager.resources.map((resource) =>
        this.applyContextResourceBaseDir(resource, baseDir)
      );
    }

    const subagents = agents.subagents.map((agent) => {
      const cloned = { ...agent };

      cloned.promptTemplate = this.applyTemplateBaseDir(
        agent.promptTemplate,
        baseDir
      );

      cloned.defaultUserPromptTemplate = this.applyTemplateBaseDir(
        agent.defaultUserPromptTemplate,
        baseDir
      );

      if (agent.resources) {
        cloned.resources = agent.resources.map((resource) =>
          this.applyContextResourceBaseDir(resource, baseDir)
        );
      }

      return cloned;
    });

    return {
      ...agents,
      manager,
      subagents,
    };
  }

  private applyContextResourceBaseDir(
    resource: ContextResourceConfig,
    baseDir: string
  ): ContextResourceConfig {
    if (resource.type === "bundle") {
      if (resource.baseDir) {
        return resource;
      }
      return {
        ...resource,
        baseDir,
      };
    }

    const template = this.applyTemplateBaseDir(resource.template, baseDir);
    if (template === resource.template) {
      return resource;
    }

    return {
      ...resource,
      template: template!,
    };
  }

  private applyTemplateBaseDir<T extends { baseDir?: string }>(
    descriptor: T | undefined,
    baseDir: string
  ): T | undefined {
    if (!descriptor) {
      return undefined;
    }

    if (descriptor.baseDir) {
      return descriptor;
    }

    return {
      ...descriptor,
      baseDir,
    };
  }

  private cloneTranscriptConfig(
    config: TranscriptConfig | undefined,
  ): TranscriptConfig | undefined {
    if (!config) {
      return undefined;
    }

    const cloned: TranscriptConfig = {};
    if (config.compactor) {
      cloned.compactor = { ...config.compactor };
    }

    return cloned;
  }

  private cloneProviderConfig(config: ProviderConfig): ProviderConfig {
    return JSON.parse(JSON.stringify(config)) as ProviderConfig;
  }

  private cloneProviderProfile(
    profile: ProviderProfileConfig
  ): ProviderProfileConfig {
    return {
      provider: this.cloneProviderConfig(profile.provider),
      model: profile.model,
    };
  }

  private mergeProviderConfig(
    base: ProviderConfig,
    overrides?: Partial<ProviderConfig>
  ): ProviderConfig {
    const merged = {
      ...this.cloneProviderConfig(base),
      ...(overrides ?? {}),
    } as ProviderConfig;

    if (typeof merged.name !== "string" || merged.name.trim() === "") {
      throw new Error("provider.name must be a non-empty string.");
    }

    return merged;
  }

  private mergeApiConfig(
    base: ApiConfig | undefined,
    input: Partial<ApiConfig> | undefined
  ): ApiConfig | undefined {
    if (!base && !input) {
      return undefined;
    }

    const normalizedBase: ApiConfig = base
      ? {
        ...base,
        telemetry: base.telemetry ? { ...base.telemetry } : undefined,
        validation: base.validation ? { ...base.validation } : undefined,
        cache: base.cache ? { ...base.cache } : undefined,
        auth: base.auth
          ? {
            ...base.auth,
            apiKeys: base.auth.apiKeys
              ? [...base.auth.apiKeys]
              : base.auth.apiKeys,
          }
          : undefined,
      }
      : {};

    if (!input) {
      return normalizedBase;
    }

    const telemetry =
      normalizedBase.telemetry || input.telemetry
        ? {
          ...(normalizedBase.telemetry ?? {}),
          ...(input.telemetry ?? {}),
        }
        : input.telemetry;

    const validation =
      normalizedBase.validation || input.validation
        ? {
          ...(normalizedBase.validation ?? {}),
          ...(input.validation ?? {}),
        }
        : input.validation;

    const cache =
      normalizedBase.cache || input.cache
        ? {
          ...(normalizedBase.cache ?? {}),
          ...(input.cache ?? {}),
        }
        : input.cache;

    const auth =
      normalizedBase.auth || input.auth
        ? {
          ...(normalizedBase.auth ?? {}),
          ...(input.auth ?? {}),
          apiKeys: input.auth?.apiKeys
            ? [...input.auth.apiKeys]
            : normalizedBase.auth?.apiKeys
              ? [...normalizedBase.auth.apiKeys]
              : input.auth?.apiKeys,
        }
        : input.auth;

    const host =
      typeof input.host === "string" && input.host.trim() !== ""
        ? input.host
        : normalizedBase.host;

    const port =
      typeof input.port === "number" && Number.isFinite(input.port)
        ? input.port
        : normalizedBase.port;

    return {
      ...normalizedBase,
      ...input,
      host,
      port,
      telemetry,
      validation,
      cache,
      auth,
    };
  }

  private mergeProviders(
    base: Record<string, ProviderProfileConfig> | undefined,
    input: Record<string, ProviderProfileConfig> | undefined
  ): Record<string, ProviderProfileConfig> | undefined {
    if (!base && !input) {
      return undefined;
    }

    const merged: Record<string, ProviderProfileConfig> = {};

    if (base) {
      for (const [key, profile] of Object.entries(base)) {
        merged[key] = this.cloneProviderProfile(profile);
      }
    }

    if (input) {
      for (const [key, profile] of Object.entries(input)) {
        merged[key] = this.cloneProviderProfile(profile);
      }
    }

    return merged;
  }

  private cloneResourceConfig(
    resource: ContextResourceConfig
  ): ContextResourceConfig {
    if (resource.type === "bundle") {
      return {
        ...resource,
        include: [...resource.include],
        exclude: resource.exclude ? [...resource.exclude] : undefined,
      };
    }

    return {
      ...resource,
      template: { ...resource.template },
      variables: resource.variables ? { ...resource.variables } : undefined,
    };
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

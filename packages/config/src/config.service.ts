import { forwardRef, Inject, Injectable, OnApplicationBootstrap, Optional } from "@nestjs/common";
import {
  ConfigType,
} from "@nestjs/config";
import fs from "fs/promises";
import path from "path";
import { Subject } from "rxjs";
import yaml from "yaml";
import { z } from "zod";
import { MODULE_OPTIONS_TOKEN } from './config.const';
import { eddieConfig } from "./config.namespace";
import { ConfigStore } from './config.store';
import { DEFAULT_CONFIG } from "./defaults";
import type {
  AgentProviderConfig,
  AgentsConfig,
  AgentsConfigInput,
  ApiConfig,
  ApiPersistenceConfig,
  ApiPersistenceSqlConfig,
  CliRuntimeOptions,
  ContextConfig,
  ContextResourceConfig,
  EddieConfig,
  EddieConfigInput,
  LoggingConfig,
  ProviderConfig,
  ProviderProfileConfig,
  ToolsConfig,
} from "./types";

const DEFAULT_CONFIG_ROOT = path.resolve(process.cwd(), "config");

export type ConfigFileFormat = "yaml" | "json";

export interface ConfigFileSnapshot {
  path: string | null;
  format: ConfigFileFormat;
  content: string;
  input: EddieConfigInput;
  config?: EddieConfig;
  error?: string;
}

const CONFIG_FILENAMES = [
  "eddie.config.json",
  "eddie.config.yaml",
  "eddie.config.yml",
  ".eddierc",
  ".eddierc.json",
  ".eddierc.yaml",
];

const SQL_DRIVERS = ["postgres", "mysql", "mariadb"] as const;
const SQL_DRIVER_SET = new Set<string>(SQL_DRIVERS);
type SqlDriver = (typeof SQL_DRIVERS)[number];

const SQL_CONNECTION_SCHEMA = z
  .object({
    host: z.string().min(1, "host must be provided"),
    port: z
      .number()
      .int("port must be an integer")
      .positive("port must be greater than zero"),
    database: z.string().min(1, "database must be provided"),
    user: z.string().min(1, "user must be provided"),
    password: z.string().min(1, "password must be provided"),
  })
  .loose();

/**
 * ConfigService resolves Eddie configuration from disk and merges it with CLI
 * runtime overrides, normalising legacy fields along the way.
 */
@Injectable()
export class ConfigService implements OnApplicationBootstrap {
  private readonly writeSubject = new Subject<ConfigFileSnapshot>();

  readonly writes$ = this.writeSubject.asObservable();

  private readonly moduleOptions: CliRuntimeOptions;

  constructor(
    @Inject(forwardRef(() => ConfigStore)) private readonly configStore: ConfigStore,
    @Optional()
    @Inject(MODULE_OPTIONS_TOKEN)
    moduleOptions?: CliRuntimeOptions,
    @Optional()
    @Inject(eddieConfig.KEY)
    private readonly defaultsProvider?: ConfigType<typeof eddieConfig>,
  ) {
    this.moduleOptions = moduleOptions ?? {};
  }

  async onApplicationBootstrap() {
    await this.load(this.moduleOptions);
  }

  async load(options: CliRuntimeOptions): Promise<EddieConfig> {
    const configPath = await this.resolveConfigPath(options);
    const fileConfig = configPath ? await this.readConfigFile(configPath) : {};
    return this.compose(fileConfig, options);
  }

  async compose(
    input: EddieConfigInput,
    options: CliRuntimeOptions = {}
  ): Promise<EddieConfig> {
    const mergedOverrides = {
      ...this.moduleOptions,
      ...options,
    };
    const finalConfig = this.composeLayers(
      this.resolveDefaultConfig(),
      input,
      mergedOverrides,
    );

    this.validateConfig(finalConfig);

    this.configStore?.setSnapshot(finalConfig);

    return finalConfig;
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

  async readSnapshot(
    options: CliRuntimeOptions = {}
  ): Promise<ConfigFileSnapshot> {
    const configPath = await this.resolveConfigPath(options);
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
      config = await this.compose(input, options);
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
    const configRoot = this.getConfigRoot();
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
      resolvedTarget = await this.resolveConfigPath(options);
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

    const searchRoots = this.collectConfigRoots();
    for (const rootDir of searchRoots) {
      for (const name of CONFIG_FILENAMES) {
        const candidate = path.resolve(rootDir, name);
        try {
          await fs.access(candidate);
          return candidate;
        } catch {
          // keep searching
        }
      }
    }

    return null;
  }

  private getConfigRoot(): string {
    const override = process.env.CONFIG_ROOT;
    if (override && override.trim().length > 0) {
      return path.resolve(process.cwd(), override);
    }
    return DEFAULT_CONFIG_ROOT;
  }

  private collectConfigRoots(): string[] {
    const roots = new Set<string>();
    roots.add(this.getConfigRoot());
    roots.add(process.cwd());
    return Array.from(roots);
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
    context: ContextConfig | undefined
  ): ContextConfig {
    const include = context?.include ? [...context.include] : [];
    const exclude = context?.exclude ? [...context.exclude] : undefined;
    const variables = context?.variables
      ? { ...context.variables }
      : undefined;
    const resources = context?.resources
      ? context.resources.map((resource) => this.cloneResourceConfig(resource))
      : undefined;

    return {
      include,
      exclude,
      baseDir: context?.baseDir ?? process.cwd(),
      maxBytes: context?.maxBytes,
      maxFiles: context?.maxFiles,
      variables,
      resources,
    };
  }

  private applyConfigFileOverrides(
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

    const providers = this.mergeProviders(base.providers, input.providers);
    const provider = this.mergeProviderConfig(
      base.provider,
      input.provider
    );
    const mergedApi = this.mergeApiConfig(base.api, input.api);

    return {
      ...base,
      ...(input.model ? { model: input.model } : {}),
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
    };
  }

  private normalizeConfig(config: EddieConfig): EddieConfig {
    const logging = this.normalizeLogging(config);
    return {
      ...config,
      ...logging,
      agents: this.ensureAgentsShape(
        config.agents,
        config.systemPrompt
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

  private validateContextResources(
    resources: ContextResourceConfig[] | undefined,
    path: string
  ): void {
    if (typeof resources === "undefined") {
      return;
    }

    if (!Array.isArray(resources)) {
      throw new Error(`${path} must be an array.`);
    }

    resources.forEach((resource, index) => {
      if (!resource || typeof resource !== "object") {
        throw new Error(`${path}[${index}] must be an object.`);
      }

      if (typeof resource.id !== "string" || resource.id.trim() === "") {
        throw new Error(
          `${path}[${index}].id must be a non-empty string.`
        );
      }

      if (
        typeof resource.name !== "undefined" &&
        typeof resource.name !== "string"
      ) {
        throw new Error(
          `${path}[${index}].name must be a string when provided.`
        );
      }

      if (
        typeof resource.description !== "undefined" &&
        typeof resource.description !== "string"
      ) {
        throw new Error(
          `${path}[${index}].description must be a string when provided.`
        );
      }

      if (resource.type === "bundle") {
        if (
          !Array.isArray(resource.include) ||
          resource.include.some((pattern) => typeof pattern !== "string")
        ) {
          throw new Error(
            `${path}[${index}].include must be an array of strings.`
          );
        }

        if (
          typeof resource.exclude !== "undefined" &&
          (!Array.isArray(resource.exclude) ||
            resource.exclude.some((pattern) => typeof pattern !== "string"))
        ) {
          throw new Error(
            `${path}[${index}].exclude must be an array of strings when provided.`
          );
        }

        if (
          typeof resource.baseDir !== "undefined" &&
          typeof resource.baseDir !== "string"
        ) {
          throw new Error(
            `${path}[${index}].baseDir must be a string when provided.`
          );
        }

        if (
          typeof resource.virtualPath !== "undefined" &&
          typeof resource.virtualPath !== "string"
        ) {
          throw new Error(
            `${path}[${index}].virtualPath must be a string when provided.`
          );
        }
      } else if (resource.type === "template") {
        this.validateTemplateDescriptor(
          resource.template,
          `${path}[${index}].template`
        );

        if (
          typeof resource.variables !== "undefined" &&
          !this.isPlainObject(resource.variables)
        ) {
          throw new Error(
            `${path}[${index}].variables must be an object when provided.`
          );
        }
      } else {
        throw new Error(
          `${path}[${index}].type must be either "bundle" or "template".`
        );
      }
    });
  }

  private validateProviderProfiles(
    profiles: Record<string, ProviderProfileConfig> | undefined
  ): void {
    if (typeof profiles === "undefined") {
      return;
    }

    if (!this.isPlainObject(profiles)) {
      throw new Error("providers must be an object with named profiles.");
    }

    for (const [key, profile] of Object.entries(profiles)) {
      if (!this.isPlainObject(profile)) {
        throw new Error(`providers.${key} must be an object.`);
      }

      const providerDescriptor = (profile as ProviderProfileConfig).provider;
      if (!this.isPlainObject(providerDescriptor)) {
        throw new Error(
          `providers.${key}.provider must be an object with provider settings.`
        );
      }

      const providerName = (providerDescriptor as ProviderConfig).name;
      if (typeof providerName !== "string" || providerName.trim() === "") {
        throw new Error(
          `providers.${key}.provider.name must be a non-empty string.`
        );
      }

      const profileModel = (profile as ProviderProfileConfig).model;
      if (
        typeof profileModel !== "undefined" &&
        (typeof profileModel !== "string" || profileModel.trim() === "")
      ) {
        throw new Error(
          `providers.${key}.model must be a non-empty string when provided.`
        );
      }
    }
  }

  private validateAgentProviderConfig(
    value: AgentProviderConfig | undefined,
    path: string,
    profiles: Record<string, ProviderProfileConfig> | undefined
  ): void {
    if (typeof value === "undefined") {
      return;
    }

    if (typeof value === "string") {
      if (value.trim() === "") {
        throw new Error(`${path} must be a non-empty string when provided.`);
      }

      if (profiles && value in profiles) {
        return;
      }

      return;
    }

    if (!this.isPlainObject(value)) {
      throw new Error(`${path} must be a string or object when provided.`);
    }

    if (
      typeof value.name !== "undefined" &&
      (typeof value.name !== "string" || value.name.trim() === "")
    ) {
      throw new Error(`${path}.name must be a non-empty string when provided.`);
    }
  }

  private validateTemplateDescriptor(descriptor: unknown, path: string): void {
    if (!this.isPlainObject(descriptor)) {
      throw new Error(`${path} must be an object.`);
    }

    const template = descriptor as {
      file?: unknown;
      baseDir?: unknown;
      encoding?: unknown;
      variables?: unknown;
    };

    if (typeof template.file !== "string" || template.file.trim() === "") {
      throw new Error(`${path}.file must be a non-empty string.`);
    }

    if (
      typeof template.baseDir !== "undefined" &&
      typeof template.baseDir !== "string"
    ) {
      throw new Error(`${path}.baseDir must be a string when provided.`);
    }

    if (
      typeof template.encoding !== "undefined" &&
      typeof template.encoding !== "string"
    ) {
      throw new Error(`${path}.encoding must be a string when provided.`);
    }

    if (
      typeof template.variables !== "undefined" &&
      !this.isPlainObject(template.variables)
    ) {
      throw new Error(`${path}.variables must be an object when provided.`);
    }
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private ensureSqlPersistenceConfig(
    driver: SqlDriver,
    config: unknown
  ): ApiPersistenceSqlConfig {
    if (!this.isPlainObject(config)) {
      throw new Error(
        `api.persistence.${driver} must be an object when using the ${driver} driver.`
      );
    }

    if (!("connection" in config)) {
      throw new Error(
        `api.persistence.${driver}.connection must be provided when using the ${driver} driver.`
      );
    }

    const { connection, url, ssl, ...rest } = config as {
      connection: unknown;
      url?: unknown;
      ssl?: unknown;
      [key: string]: unknown;
    };

    const connectionPath = `api.persistence.${driver}.connection`;

    if (!this.isPlainObject(connection)) {
      throw new Error(
        `${connectionPath} must be an object when using the ${driver} driver.`
      );
    }

    if (typeof connection.port !== "number") {
      throw new Error(`${connectionPath}.port must be a number.`);
    }

    const result = SQL_CONNECTION_SCHEMA.safeParse(connection);
    if (!result.success) {
      const [issue] = result.error.issues;
      const pathSuffix = issue?.path?.length
        ? `.${issue.path.map(String).join(".")}`
        : "";
      const message = issue?.message ?? "is invalid.";
      throw new Error(`${connectionPath}${pathSuffix} ${message}`);
    }

    const validatedUrl = this.ensureOptionalPrimitive(
      driver,
      "url",
      "string",
      url
    );
    const validatedSsl = this.ensureOptionalPrimitive(
      driver,
      "ssl",
      "boolean",
      ssl
    );

    const validated: ApiPersistenceSqlConfig = {
      ...rest,
      connection: result.data,
    };

    if (typeof validatedUrl !== "undefined") {
      validated.url = validatedUrl;
    }

    if (typeof validatedSsl !== "undefined") {
      validated.ssl = validatedSsl;
    }

    return validated;
  }

  private ensureOptionalPrimitive(
    driver: SqlDriver,
    property: "url",
    expectedType: "string",
    value: unknown
  ): string | undefined;
  private ensureOptionalPrimitive(
    driver: SqlDriver,
    property: "ssl",
    expectedType: "boolean",
    value: unknown
  ): boolean | undefined;
  private ensureOptionalPrimitive(
    driver: SqlDriver,
    property: "url" | "ssl",
    expectedType: "string" | "boolean",
    value: unknown
  ): string | boolean | undefined {
    if (typeof value === "undefined") {
      return undefined;
    }

    if (typeof value !== expectedType) {
      throw new Error(
        `api.persistence.${driver}.${property} must be a ${expectedType} when provided.`
      );
    }

    return value as string | boolean;
  }

  private validateApiPersistence(
    persistence: ApiPersistenceConfig | undefined
  ): void {
    if (!persistence) {
      return;
    }

    if (persistence.driver === "memory") {
      return;
    }

    if (persistence.driver === "sqlite") {
      if (
        typeof persistence.sqlite !== "undefined" &&
        !this.isPlainObject(persistence.sqlite)
      ) {
        throw new Error(
          "api.persistence.sqlite must be an object when provided."
        );
      }

      if (
        persistence.sqlite &&
        typeof persistence.sqlite.filename !== "undefined" &&
        typeof persistence.sqlite.filename !== "string"
      ) {
        throw new Error(
          "api.persistence.sqlite.filename must be a string when provided."
        );
      }

      return;
    }

    if (SQL_DRIVER_SET.has(persistence.driver)) {
      const driver = persistence.driver as SqlDriver;
      const driverConfig = (persistence as Record<string, unknown>)[driver];
      if (typeof driverConfig === "undefined") {
        throw new Error(
          `api.persistence.${driver} must be provided when using the ${driver} driver.`
        );
      }

      const validated = this.ensureSqlPersistenceConfig(driver, driverConfig);
      (persistence as Record<string, unknown>)[driver] = validated;
      return;
    }

    throw new Error(
      "api.persistence.driver must be one of 'memory', 'sqlite', 'postgres', 'mysql', or 'mariadb'."
    );
  }

  private validateConfig(config: EddieConfig): void {
    this.validateToolsConfig(config.tools);

    if (
      typeof config.context?.variables !== "undefined" &&
      !this.isPlainObject(config.context.variables)
    ) {
      throw new Error("context.variables must be an object when provided.");
    }

    this.validateContextResources(config.context?.resources, "context.resources");
    this.validateProviderProfiles(config.providers);
    this.validateApiPersistence(config.api?.persistence);

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

    if (
      typeof agents.manager.promptTemplate !== "undefined"
    ) {
      this.validateTemplateDescriptor(
        agents.manager.promptTemplate,
        "agents.manager.promptTemplate"
      );
    }

    if (
      typeof agents.manager.defaultUserPromptTemplate !== "undefined"
    ) {
      this.validateTemplateDescriptor(
        agents.manager.defaultUserPromptTemplate,
        "agents.manager.defaultUserPromptTemplate"
      );
    }

    if (
      typeof agents.manager.variables !== "undefined" &&
      !this.isPlainObject(agents.manager.variables)
    ) {
      throw new Error(
        "agents.manager.variables must be an object when provided."
      );
    }

    this.validateAgentProviderConfig(
      agents.manager.provider,
      "agents.manager.provider",
      config.providers
    );

    this.validateContextResources(
      agents.manager.resources,
      "agents.manager.resources"
    );

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

      if (typeof subagent.promptTemplate !== "undefined") {
        this.validateTemplateDescriptor(
          subagent.promptTemplate,
          `agents.subagents[${index}].promptTemplate`
        );
      }

      if (typeof subagent.defaultUserPromptTemplate !== "undefined") {
        this.validateTemplateDescriptor(
          subagent.defaultUserPromptTemplate,
          `agents.subagents[${index}].defaultUserPromptTemplate`
        );
      }

      if (
        typeof subagent.variables !== "undefined" &&
        !this.isPlainObject(subagent.variables)
      ) {
        throw new Error(
          `agents.subagents[${index}].variables must be an object when provided.`
        );
      }

      this.validateContextResources(
        subagent.resources,
        `agents.subagents[${index}].resources`
      );

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

      this.validateAgentProviderConfig(
        subagent.provider,
        `agents.subagents[${index}].provider`,
        config.providers
      );
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

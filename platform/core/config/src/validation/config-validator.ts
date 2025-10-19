import { Injectable } from "@nestjs/common";
import { z } from "zod";

import type {
  AgentProviderConfig,
  ApiDemoConfig,
  ApiPersistenceConfig,
  ApiPersistenceSqlConfig,
  ContextResourceConfig,
  EddieConfig,
  ProviderConfig,
  ProviderProfileConfig,
  ToolsConfig,
} from "../types";
import { CURRENT_CONFIG_VERSION } from "../migrations";

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

export interface ConfigValidationIssue {
  path: string;
  message: string;
}

export class ConfigValidationError extends Error {
  readonly summary: string;
  readonly issues: ConfigValidationIssue[];

  constructor(summary: string, issues: ConfigValidationIssue[]) {
    super(summary);
    this.name = "ConfigValidationError";
    this.summary = summary;
    this.issues = issues;
  }
}

@Injectable()
export class ConfigValidator {
  validate(config: EddieConfig): void {
    const issues: ConfigValidationIssue[] = [];

    const { version } = config;
    if (typeof version !== "number") {
      this.pushValidationIssue(
        issues,
        "version",
        "version must be provided as a number.",
      );
    } else if (version !== CURRENT_CONFIG_VERSION) {
      this.pushValidationIssue(
        issues,
        "version",
        `version must equal ${CURRENT_CONFIG_VERSION}. Received ${version}.`,
      );
    }

    if (
      typeof config.projectDir !== "string" ||
      config.projectDir.trim() === ""
    ) {
      this.pushValidationIssue(
        issues,
        "projectDir",
        "projectDir must be a non-empty string.",
      );
    }

    this.validateToolsConfig(config.tools, issues);

    if (
      typeof config.context?.variables !== "undefined" &&
      !this.isPlainObject(config.context.variables)
    ) {
      this.pushValidationIssue(
        issues,
        "context.variables",
        "context.variables must be an object when provided.",
      );
    }

    this.validateContextResources(
      config.context?.resources,
      "context.resources",
      issues,
    );
    this.validateProviderProfiles(config.providers, issues);
    this.validateApiPersistence(config.api?.persistence, issues);
    this.validateApiDemo(config.api?.demo, issues);

    const { agents } = config;

    if (agents) {
      if (typeof agents.mode !== "string" || agents.mode.trim() === "") {
        this.pushValidationIssue(
          issues,
          "agents.mode",
          "agents.mode must be a non-empty string.",
        );
      }

      const manager = agents.manager;

      if (
        !manager ||
        typeof manager.prompt !== "string" ||
        manager.prompt.trim() === ""
      ) {
        this.pushValidationIssue(
          issues,
          "agents.manager.prompt",
          "agents.manager.prompt must be provided as a non-empty string.",
        );
      } else {
        if (typeof manager.promptTemplate !== "undefined") {
          this.validateTemplateDescriptor(
            manager.promptTemplate,
            "agents.manager.promptTemplate",
            issues,
          );
        }

        if (typeof manager.defaultUserPromptTemplate !== "undefined") {
          this.validateTemplateDescriptor(
            manager.defaultUserPromptTemplate,
            "agents.manager.defaultUserPromptTemplate",
            issues,
          );
        }
      }

      if (
        typeof manager?.variables !== "undefined" &&
        !this.isPlainObject(manager.variables)
      ) {
        this.pushValidationIssue(
          issues,
          "agents.manager.variables",
          "agents.manager.variables must be an object when provided.",
        );
      }

      this.validateAgentProviderConfig(
        manager?.provider,
        "agents.manager.provider",
        config.providers,
        issues,
      );

      this.validateContextResources(
        manager?.resources,
        "agents.manager.resources",
        issues,
      );

      if (typeof agents.enableSubagents !== "boolean") {
        this.pushValidationIssue(
          issues,
          "agents.enableSubagents",
          "agents.enableSubagents must be a boolean.",
        );
      }

      const subagents = agents.subagents;
      if (!Array.isArray(subagents)) {
        this.pushValidationIssue(
          issues,
          "agents.subagents",
          "agents.subagents must be an array.",
        );
      } else {
        subagents.forEach((subagent, index) => {
          const basePath = `agents.subagents[${index}]`;

          if (!subagent || typeof subagent !== "object") {
            this.pushValidationIssue(
              issues,
              basePath,
              `${basePath} must be an object.`,
            );
            return;
          }

          if (typeof subagent.id !== "string" || subagent.id.trim() === "") {
            this.pushValidationIssue(
              issues,
              `${basePath}.id`,
              `${basePath}.id must be a non-empty string.`,
            );
          }

          if (
            typeof subagent.prompt !== "undefined" &&
            typeof subagent.prompt !== "string"
          ) {
            this.pushValidationIssue(
              issues,
              `${basePath}.prompt`,
              `${basePath}.prompt must be a string when provided.`,
            );
          }

          if (typeof subagent.promptTemplate !== "undefined") {
            this.validateTemplateDescriptor(
              subagent.promptTemplate,
              `${basePath}.promptTemplate`,
              issues,
            );
          }

          if (typeof subagent.defaultUserPromptTemplate !== "undefined") {
            this.validateTemplateDescriptor(
              subagent.defaultUserPromptTemplate,
              `${basePath}.defaultUserPromptTemplate`,
              issues,
            );
          }

          if (
            typeof subagent.variables !== "undefined" &&
            !this.isPlainObject(subagent.variables)
          ) {
            this.pushValidationIssue(
              issues,
              `${basePath}.variables`,
              `${basePath}.variables must be an object when provided.`,
            );
          }

          this.validateContextResources(
            subagent.resources,
            `${basePath}.resources`,
            issues,
          );

          if (
            typeof subagent.name !== "undefined" &&
            typeof subagent.name !== "string"
          ) {
            this.pushValidationIssue(
              issues,
              `${basePath}.name`,
              `${basePath}.name must be a string when provided.`,
            );
          }

          if (
            typeof subagent.description !== "undefined" &&
            typeof subagent.description !== "string"
          ) {
            this.pushValidationIssue(
              issues,
              `${basePath}.description`,
              `${basePath}.description must be a string when provided.`,
            );
          }

          if (
            typeof subagent.tools !== "undefined" &&
            (!Array.isArray(subagent.tools) ||
              subagent.tools.some((tool) => typeof tool !== "string"))
          ) {
            this.pushValidationIssue(
              issues,
              `${basePath}.tools`,
              `${basePath}.tools must be an array of strings when provided.`,
            );
          }

          if (
            typeof subagent.routingThreshold !== "undefined" &&
            (typeof subagent.routingThreshold !== "number" ||
              Number.isNaN(subagent.routingThreshold))
          ) {
            this.pushValidationIssue(
              issues,
              `${basePath}.routingThreshold`,
              `${basePath}.routingThreshold must be a number when provided.`,
            );
          }

          this.validateAgentProviderConfig(
            subagent.provider,
            `${basePath}.provider`,
            config.providers,
            issues,
          );

          if (
            typeof subagent.model !== "undefined" &&
            (typeof subagent.model !== "string" ||
              subagent.model.trim() === "")
          ) {
            this.pushValidationIssue(
              issues,
              `${basePath}.model`,
              `${basePath}.model must be a non-empty string when provided.`,
            );
          }

          if (
            typeof subagent.transcript !== "undefined" &&
            !this.isPlainObject(subagent.transcript)
          ) {
            this.pushValidationIssue(
              issues,
              `${basePath}.transcript`,
              `${basePath}.transcript must be an object when provided.`,
            );
          }
        });
      }

      const routing = agents.routing;
      if (typeof routing !== "undefined") {
        if (!this.isPlainObject(routing)) {
          this.pushValidationIssue(
            issues,
            "agents.routing",
            "agents.routing must be an object when provided.",
          );
        } else {
          const { confidenceThreshold, maxDepth } = routing;

          if (typeof confidenceThreshold !== "undefined") {
            if (
              typeof confidenceThreshold !== "number" ||
              Number.isNaN(confidenceThreshold) ||
              confidenceThreshold < 0 ||
              confidenceThreshold > 1
            ) {
              this.pushValidationIssue(
                issues,
                "agents.routing.confidenceThreshold",
                "agents.routing.confidenceThreshold must be a number between 0 and 1 when provided.",
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
              this.pushValidationIssue(
                issues,
                "agents.routing.maxDepth",
                "agents.routing.maxDepth must be a non-negative integer when provided.",
              );
            }
          }
        }
      }
    }

    if (issues.length > 0) {
      throw new ConfigValidationError(
        this.createValidationSummary(issues.length),
        issues,
      );
    }
  }

  private validateToolsConfig(
    tools: ToolsConfig | undefined,
    issues: ConfigValidationIssue[],
  ): void {
    if (!tools?.sources) {
      return;
    }

    if (!Array.isArray(tools.sources)) {
      this.pushValidationIssue(
        issues,
        "tools.sources",
        "tools.sources must be an array when provided.",
      );
      return;
    }

    tools.sources.forEach((source, index) => {
      const basePath = `tools.sources[${index}]`;

      if (!source || typeof source !== "object") {
        this.pushValidationIssue(
          issues,
          basePath,
          `${basePath} must be an object.`,
        );
        return;
      }

      if (source.type !== "mcp") {
        this.pushValidationIssue(
          issues,
          `${basePath}.type`,
          `${basePath}.type must be the literal string "mcp".`,
        );
      }

      if (typeof source.id !== "string" || source.id.trim() === "") {
        this.pushValidationIssue(
          issues,
          `${basePath}.id`,
          `${basePath}.id must be provided as a non-empty string.`,
        );
      }

      if (typeof source.url !== "string" || source.url.trim() === "") {
        this.pushValidationIssue(
          issues,
          `${basePath}.url`,
          `${basePath}.url must be provided as a non-empty string.`,
        );
      }

      if (
        typeof source.name !== "undefined" &&
        (typeof source.name !== "string" || source.name.trim() === "")
      ) {
        this.pushValidationIssue(
          issues,
          `${basePath}.name`,
          `${basePath}.name must be a non-empty string when provided.`,
        );
      }

      if (typeof source.headers !== "undefined") {
        if (
          !source.headers ||
          typeof source.headers !== "object" ||
          Array.isArray(source.headers)
        ) {
          this.pushValidationIssue(
            issues,
            `${basePath}.headers`,
            `${basePath}.headers must be an object with string values when provided.`,
          );
        } else {
          for (const [key, value] of Object.entries(source.headers)) {
            if (typeof value !== "string") {
              this.pushValidationIssue(
                issues,
                `${basePath}.headers.${key}`,
                `${basePath}.headers.${key} must be a string.`,
              );
            }
          }
        }
      }

      if (typeof source.auth !== "undefined") {
        const auth = source.auth;
        if (!auth || typeof auth !== "object") {
          this.pushValidationIssue(
            issues,
            `${basePath}.auth`,
            `${basePath}.auth must be an object when provided.`,
          );
        } else if (auth.type === "basic") {
          if (
            typeof auth.username !== "string" ||
            auth.username.trim() === "" ||
            typeof auth.password !== "string"
          ) {
            this.pushValidationIssue(
              issues,
              `${basePath}.auth`,
              `${basePath}.auth must include non-empty username and password for basic auth.`,
            );
          }
        } else if (auth.type === "bearer") {
          if (typeof auth.token !== "string" || auth.token.trim() === "") {
            this.pushValidationIssue(
              issues,
              `${basePath}.auth.token`,
              `${basePath}.auth.token must be a non-empty string for bearer auth.`,
            );
          }
        } else if (auth.type === "none") {
          // nothing additional
        } else {
          this.pushValidationIssue(
            issues,
            `${basePath}.auth.type`,
            `${basePath}.auth.type must be one of "basic", "bearer", or "none".`,
          );
        }
      }

      if (
        typeof source.capabilities !== "undefined" &&
        (typeof source.capabilities !== "object" ||
          source.capabilities === null ||
          Array.isArray(source.capabilities))
      ) {
        this.pushValidationIssue(
          issues,
          `${basePath}.capabilities`,
          `${basePath}.capabilities must be an object when provided.`,
        );
      }
    });
  }

  private validateContextResources(
    resources: ContextResourceConfig[] | undefined,
    path: string,
    issues: ConfigValidationIssue[],
  ): void {
    if (typeof resources === "undefined") {
      return;
    }

    if (!Array.isArray(resources)) {
      this.pushValidationIssue(issues, path, `${path} must be an array.`);
      return;
    }

    resources.forEach((resource, index) => {
      const basePath = `${path}[${index}]`;
      if (!resource || typeof resource !== "object") {
        this.pushValidationIssue(issues, basePath, `${basePath} must be an object.`);
        return;
      }

      if (typeof resource.id !== "string" || resource.id.trim() === "") {
        this.pushValidationIssue(
          issues,
          `${basePath}.id`,
          `${basePath}.id must be a non-empty string.`,
        );
      }

      if (
        typeof resource.name !== "undefined" &&
        typeof resource.name !== "string"
      ) {
        this.pushValidationIssue(
          issues,
          `${basePath}.name`,
          `${basePath}.name must be a string when provided.`,
        );
      }

      if (
        typeof resource.description !== "undefined" &&
        typeof resource.description !== "string"
      ) {
        this.pushValidationIssue(
          issues,
          `${basePath}.description`,
          `${basePath}.description must be a string when provided.`,
        );
      }

      if (resource.type === "bundle") {
        if (
          !Array.isArray(resource.include) ||
          resource.include.some((pattern) => typeof pattern !== "string")
        ) {
          this.pushValidationIssue(
            issues,
            `${basePath}.include`,
            `${basePath}.include must be an array of strings.`,
          );
        }

        if (
          typeof resource.exclude !== "undefined" &&
          (!Array.isArray(resource.exclude) ||
            resource.exclude.some((pattern) => typeof pattern !== "string"))
        ) {
          this.pushValidationIssue(
            issues,
            `${basePath}.exclude`,
            `${basePath}.exclude must be an array of strings when provided.`,
          );
        }

        if (
          typeof resource.baseDir !== "undefined" &&
          typeof resource.baseDir !== "string"
        ) {
          this.pushValidationIssue(
            issues,
            `${basePath}.baseDir`,
            `${basePath}.baseDir must be a string when provided.`,
          );
        }

        if (
          typeof resource.virtualPath !== "undefined" &&
          typeof resource.virtualPath !== "string"
        ) {
          this.pushValidationIssue(
            issues,
            `${basePath}.virtualPath`,
            `${basePath}.virtualPath must be a string when provided.`,
          );
        }
      } else if (resource.type === "template") {
        this.validateTemplateDescriptor(
          resource.template,
          `${basePath}.template`,
          issues,
        );

        if (
          typeof resource.variables !== "undefined" &&
          !this.isPlainObject(resource.variables)
        ) {
          this.pushValidationIssue(
            issues,
            `${basePath}.variables`,
            `${basePath}.variables must be an object when provided.`,
          );
        }
      } else {
        this.pushValidationIssue(
          issues,
          `${basePath}.type`,
          `${basePath}.type must be either "bundle" or "template".`,
        );
      }
    });
  }

  private validateProviderProfiles(
    profiles: Record<string, ProviderProfileConfig> | undefined,
    issues: ConfigValidationIssue[],
  ): void {
    if (typeof profiles === "undefined") {
      return;
    }

    if (!this.isPlainObject(profiles)) {
      this.pushValidationIssue(
        issues,
        "providers",
        "providers must be an object with named profiles.",
      );
      return;
    }

    for (const [key, profile] of Object.entries(profiles)) {
      const basePath = `providers.${key}`;
      if (!this.isPlainObject(profile)) {
        this.pushValidationIssue(
          issues,
          basePath,
          `${basePath} must be an object.`,
        );
        continue;
      }

      const providerDescriptor = (profile as ProviderProfileConfig).provider;
      if (!this.isPlainObject(providerDescriptor)) {
        this.pushValidationIssue(
          issues,
          `${basePath}.provider`,
          `${basePath}.provider must be an object with provider settings.`,
        );
        continue;
      }

      const providerName = (providerDescriptor as ProviderConfig).name;
      if (typeof providerName !== "string" || providerName.trim() === "") {
        this.pushValidationIssue(
          issues,
          `${basePath}.provider.name`,
          `${basePath}.provider.name must be a non-empty string.`,
        );
      }

      const profileModel = (profile as ProviderProfileConfig).model;
      if (
        typeof profileModel !== "undefined" &&
        (typeof profileModel !== "string" || profileModel.trim() === "")
      ) {
        this.pushValidationIssue(
          issues,
          `${basePath}.model`,
          `${basePath}.model must be a non-empty string when provided.`,
        );
      }
    }
  }

  private validateAgentProviderConfig(
    value: AgentProviderConfig | undefined,
    path: string,
    profiles: Record<string, ProviderProfileConfig> | undefined,
    issues: ConfigValidationIssue[],
  ): void {
    if (typeof value === "undefined") {
      return;
    }

    if (typeof value === "string") {
      if (value.trim() === "") {
        this.pushValidationIssue(
          issues,
          path,
          `${path} must be a non-empty string when provided.`,
        );
      }

      if (profiles && value in profiles) {
        return;
      }

      return;
    }

    if (!this.isPlainObject(value)) {
      this.pushValidationIssue(
        issues,
        path,
        `${path} must be a string or object when provided.`,
      );
      return;
    }

    if (
      typeof value.name !== "undefined" &&
      (typeof value.name !== "string" || value.name.trim() === "")
    ) {
      this.pushValidationIssue(
        issues,
        `${path}.name`,
        `${path}.name must be a non-empty string when provided.`,
      );
    }
  }

  private validateTemplateDescriptor(
    descriptor: unknown,
    path: string,
    issues: ConfigValidationIssue[],
  ): void {
    if (!this.isPlainObject(descriptor)) {
      this.pushValidationIssue(
        issues,
        path,
        `${path} must be an object.`,
      );
      return;
    }

    const template = descriptor as {
      file?: unknown;
      baseDir?: unknown;
      encoding?: unknown;
      variables?: unknown;
    };

    if (typeof template.file !== "string" || template.file.trim() === "") {
      this.pushValidationIssue(
        issues,
        `${path}.file`,
        `${path}.file must be a non-empty string.`,
      );
    }

    if (
      typeof template.baseDir !== "undefined" &&
      typeof template.baseDir !== "string"
    ) {
      this.pushValidationIssue(
        issues,
        `${path}.baseDir`,
        `${path}.baseDir must be a string when provided.`,
      );
    }

    if (
      typeof template.encoding !== "undefined" &&
      typeof template.encoding !== "string"
    ) {
      this.pushValidationIssue(
        issues,
        `${path}.encoding`,
        `${path}.encoding must be a string when provided.`,
      );
    }

    if (
      typeof template.variables !== "undefined" &&
      !this.isPlainObject(template.variables)
    ) {
      this.pushValidationIssue(
        issues,
        `${path}.variables`,
        `${path}.variables must be an object when provided.`,
      );
    }
  }

  private validateApiPersistence(
    persistence: ApiPersistenceConfig | undefined,
    issues: ConfigValidationIssue[],
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
        this.pushValidationIssue(
          issues,
          "api.persistence.sqlite",
          "api.persistence.sqlite must be an object when provided.",
        );
      }

      if (
        persistence.sqlite &&
        typeof persistence.sqlite.filename !== "undefined" &&
        typeof persistence.sqlite.filename !== "string"
      ) {
        this.pushValidationIssue(
          issues,
          "api.persistence.sqlite.filename",
          "api.persistence.sqlite.filename must be a string when provided.",
        );
      }

      return;
    }

    if (SQL_DRIVER_SET.has(persistence.driver)) {
      const driver = persistence.driver as SqlDriver;
      const driverConfig = (persistence as Record<string, unknown>)[driver];
      if (typeof driverConfig === "undefined") {
        this.pushValidationIssue(
          issues,
          `api.persistence.${driver}`,
          `api.persistence.${driver} must be provided when using the ${driver} driver.`,
        );
        return;
      }

      try {
        const validated = this.ensureSqlPersistenceConfig(driver, driverConfig);
        (persistence as Record<string, unknown>)[driver] = validated;
      } catch (sqlError) {
        this.pushIssueFromError(
          issues,
          `api.persistence.${driver}`,
          sqlError,
        );
      }
      return;
    }

    this.pushValidationIssue(
      issues,
      "api.persistence.driver",
      "api.persistence.driver must be one of 'memory', 'sqlite', 'postgres', 'mysql', or 'mariadb'.",
    );
  }

  private validateApiDemo(
    demo: ApiDemoConfig | undefined,
    issues: ConfigValidationIssue[],
  ): void {
    if (!demo) {
      return;
    }

    if (typeof demo.enabled !== "undefined" && typeof demo.enabled !== "boolean") {
      this.pushValidationIssue(
        issues,
        "api.demo.enabled",
        "api.demo.enabled must be a boolean when provided.",
      );
    }

    if (typeof demo.fixtures === "undefined") {
      return;
    }

    if (!this.isPlainObject(demo.fixtures)) {
      this.pushValidationIssue(
        issues,
        "api.demo.fixtures",
        "api.demo.fixtures must be an object when provided.",
      );
      return;
    }

    if (typeof demo.fixtures.path !== "undefined") {
      const pathValue = demo.fixtures.path;
      if (typeof pathValue !== "string" || pathValue.trim() === "") {
        this.pushValidationIssue(
          issues,
          "api.demo.fixtures.path",
          "api.demo.fixtures.path must be a non-empty string when provided.",
        );
      }
    }
  }

  private ensureSqlPersistenceConfig(
    driver: SqlDriver,
    config: unknown,
  ): ApiPersistenceSqlConfig {
    if (!this.isPlainObject(config)) {
      throw new Error(
        `api.persistence.${driver} must be an object when using the ${driver} driver.`,
      );
    }

    if (!("connection" in config)) {
      throw new Error(
        `api.persistence.${driver}.connection must be provided when using the ${driver} driver.`,
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
        `${connectionPath} must be an object when using the ${driver} driver.`,
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
      url,
    );
    const validatedSsl = this.ensureOptionalPrimitive(
      driver,
      "ssl",
      "boolean",
      ssl,
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
    value: unknown,
  ): string | undefined;
  private ensureOptionalPrimitive(
    driver: SqlDriver,
    property: "ssl",
    expectedType: "boolean",
    value: unknown,
  ): boolean | undefined;
  private ensureOptionalPrimitive(
    driver: SqlDriver,
    property: "url" | "ssl",
    expectedType: "string" | "boolean",
    value: unknown,
  ): string | boolean | undefined {
    if (typeof value === "undefined") {
      return undefined;
    }

    if (typeof value !== expectedType) {
      throw new Error(
        `api.persistence.${driver}.${property} must be a ${expectedType} when provided.`,
      );
    }

    return value as string | boolean;
  }

  private pushValidationIssue(
    issues: ConfigValidationIssue[],
    path: string,
    message: string,
  ): void {
    issues.push({ path, message });
  }

  private createValidationSummary(issueCount: number): string {
    return issueCount === 1
      ? "Configuration validation failed with 1 issue."
      : `Configuration validation failed with ${issueCount} issues.`;
  }

  private pushIssueFromError(
    issues: ConfigValidationIssue[],
    fallbackPath: string,
    cause: unknown,
  ): void {
    if (
      cause &&
      typeof cause === "object" &&
      "path" in cause &&
      typeof (cause as { path: unknown }).path === "string" &&
      "message" in cause &&
      typeof (cause as { message: unknown }).message === "string"
    ) {
      this.pushValidationIssue(
        issues,
        (cause as { path: string }).path,
        (cause as { message: string }).message,
      );
      return;
    }

    const message =
      cause instanceof Error
        ? cause.message
        : typeof cause === "string"
          ? cause
          : "Invalid configuration.";
    const match = message.match(/^(?<path>[^\s]+)\s/);
    const path = match?.groups?.path ?? fallbackPath;
    this.pushValidationIssue(issues, path, message);
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

import { Injectable } from "@nestjs/common";
import { z } from "zod";

import type {
  AgentProviderConfig,
  ApiPersistenceConfig,
  ApiPersistenceSqlConfig,
  ContextResourceConfig,
  EddieConfig,
  ProviderConfig,
  ProviderProfileConfig,
  ToolsConfig,
} from "../types";

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

@Injectable()
export class ConfigValidator {
  validate(config: EddieConfig): void {
    const errors: Error[] = [];

    this.capture(errors, () => this.ensureProjectDir(config.projectDir));
    this.capture(errors, () => this.validateToolsConfig(config.tools));
    this.capture(errors, () => {
      if (
        typeof config.context?.variables !== "undefined" &&
        !this.isPlainObject(config.context.variables)
      ) {
        throw new Error("context.variables must be an object when provided.");
      }
    });
    this.capture(errors, () =>
      this.validateContextResources(
        config.context?.resources,
        "context.resources",
      ),
    );
    this.capture(errors, () => this.validateProviderProfiles(config.providers));
    this.capture(errors, () => this.validateApiPersistence(config.api?.persistence));
    this.capture(errors, () => this.validateAgentsConfig(config));

    if (errors.length === 1) {
      throw errors[0]!;
    }

    if (errors.length > 1) {
      const message = errors.map((error) => error.message).join("\n");
      throw new AggregateError(errors, message);
    }
  }

  private capture(errors: Error[], fn: () => void): void {
    try {
      fn();
    } catch (unknownError) {
      if (unknownError instanceof AggregateError) {
        for (const nested of unknownError.errors) {
          errors.push(
            nested instanceof Error ? nested : new Error(String(nested)),
          );
        }
        return;
      }

      errors.push(
        unknownError instanceof Error
          ? unknownError
          : new Error(String(unknownError)),
      );
    }
  }

  private ensureProjectDir(projectDir: string | undefined): void {
    if (typeof projectDir !== "string" || projectDir.trim() === "") {
      throw new Error("projectDir must be a non-empty string.");
    }
  }

  private validateAgentsConfig(config: EddieConfig): void {
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
        "agents.manager.prompt must be provided as a non-empty string.",
      );
    }

    if (typeof agents.manager.promptTemplate !== "undefined") {
      this.validateTemplateDescriptor(
        agents.manager.promptTemplate,
        "agents.manager.promptTemplate",
      );
    }

    if (typeof agents.manager.defaultUserPromptTemplate !== "undefined") {
      this.validateTemplateDescriptor(
        agents.manager.defaultUserPromptTemplate,
        "agents.manager.defaultUserPromptTemplate",
      );
    }

    if (
      typeof agents.manager.variables !== "undefined" &&
      !this.isPlainObject(agents.manager.variables)
    ) {
      throw new Error(
        "agents.manager.variables must be an object when provided.",
      );
    }

    this.validateAgentProviderConfig(
      agents.manager.provider,
      "agents.manager.provider",
      config.providers,
    );

    this.validateContextResources(
      agents.manager.resources,
      "agents.manager.resources",
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
          `agents.subagents[${index}].id must be a non-empty string.`,
        );
      }

      if (
        typeof subagent.prompt !== "undefined" &&
        typeof subagent.prompt !== "string"
      ) {
        throw new Error(
          `agents.subagents[${index}].prompt must be a string when provided.`,
        );
      }

      if (typeof subagent.promptTemplate !== "undefined") {
        this.validateTemplateDescriptor(
          subagent.promptTemplate,
          `agents.subagents[${index}].promptTemplate`,
        );
      }

      if (typeof subagent.defaultUserPromptTemplate !== "undefined") {
        this.validateTemplateDescriptor(
          subagent.defaultUserPromptTemplate,
          `agents.subagents[${index}].defaultUserPromptTemplate`,
        );
      }

      if (
        typeof subagent.variables !== "undefined" &&
        !this.isPlainObject(subagent.variables)
      ) {
        throw new Error(
          `agents.subagents[${index}].variables must be an object when provided.`,
        );
      }

      this.validateContextResources(
        subagent.resources,
        `agents.subagents[${index}].resources`,
      );

      if (
        typeof subagent.name !== "undefined" &&
        typeof subagent.name !== "string"
      ) {
        throw new Error(
          `agents.subagents[${index}].name must be a string when provided.`,
        );
      }

      if (
        typeof subagent.description !== "undefined" &&
        typeof subagent.description !== "string"
      ) {
        throw new Error(
          `agents.subagents[${index}].description must be a string when provided.`,
        );
      }

      if (
        typeof subagent.tools !== "undefined" &&
        (!Array.isArray(subagent.tools) ||
          subagent.tools.some((tool) => typeof tool !== "string"))
      ) {
        throw new Error(
          `agents.subagents[${index}].tools must be an array of strings when provided.`,
        );
      }

      if (
        typeof subagent.routingThreshold !== "undefined" &&
        typeof subagent.routingThreshold !== "number"
      ) {
        throw new Error(
          `agents.subagents[${index}].routingThreshold must be a number when provided.`,
        );
      }

      this.validateAgentProviderConfig(
        subagent.provider,
        `agents.subagents[${index}].provider`,
        config.providers,
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
            "agents.routing.confidenceThreshold must be a number between 0 and 1.",
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
            "agents.routing.maxDepth must be a non-negative integer when provided.",
          );
        }
      }
    }
  }

  private validateAgentProviderConfig(
    value: AgentProviderConfig | undefined,
    path: string,
    profiles: Record<string, ProviderProfileConfig> | undefined,
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

  private validateApiPersistence(
    persistence: ApiPersistenceConfig | undefined,
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
          "api.persistence.sqlite must be an object when provided.",
        );
      }

      if (
        persistence.sqlite &&
        typeof persistence.sqlite.filename !== "undefined" &&
        typeof persistence.sqlite.filename !== "string"
      ) {
        throw new Error(
          "api.persistence.sqlite.filename must be a string when provided.",
        );
      }

      return;
    }

    if (SQL_DRIVER_SET.has(persistence.driver)) {
      const driver = persistence.driver as SqlDriver;
      const driverConfig = (persistence as Record<string, unknown>)[driver];
      if (typeof driverConfig === "undefined") {
        throw new Error(
          `api.persistence.${driver} must be provided when using the ${driver} driver.`,
        );
      }

      const validated = this.ensureSqlPersistenceConfig(driver, driverConfig);
      (persistence as Record<string, unknown>)[driver] = validated;
      return;
    }

    throw new Error(
      "api.persistence.driver must be one of 'memory', 'sqlite', 'postgres', 'mysql', or 'mariadb'.",
    );
  }

  private validateContextResources(
    resources: ContextResourceConfig[] | undefined,
    path: string,
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
        throw new Error(`${path}[${index}].id must be a non-empty string.`);
      }

      if (
        typeof resource.name !== "undefined" &&
        typeof resource.name !== "string"
      ) {
        throw new Error(`${path}[${index}].name must be a string when provided.`);
      }

      if (
        typeof resource.description !== "undefined" &&
        typeof resource.description !== "string"
      ) {
        throw new Error(
          `${path}[${index}].description must be a string when provided.`,
        );
      }

      if (resource.type === "bundle") {
        if (
          !Array.isArray(resource.include) ||
          resource.include.some((pattern) => typeof pattern !== "string")
        ) {
          throw new Error(
            `${path}[${index}].include must be an array of strings.`,
          );
        }

        if (
          typeof resource.exclude !== "undefined" &&
          (!Array.isArray(resource.exclude) ||
            resource.exclude.some((pattern) => typeof pattern !== "string"))
        ) {
          throw new Error(
            `${path}[${index}].exclude must be an array of strings when provided.`,
          );
        }

        if (
          typeof resource.baseDir !== "undefined" &&
          typeof resource.baseDir !== "string"
        ) {
          throw new Error(
            `${path}[${index}].baseDir must be a string when provided.`,
          );
        }

        if (
          typeof resource.virtualPath !== "undefined" &&
          typeof resource.virtualPath !== "string"
        ) {
          throw new Error(
            `${path}[${index}].virtualPath must be a string when provided.`,
          );
        }
      } else if (resource.type === "template") {
        this.validateTemplateDescriptor(
          resource.template,
          `${path}[${index}].template`,
        );

        if (
          typeof resource.variables !== "undefined" &&
          !this.isPlainObject(resource.variables)
        ) {
          throw new Error(
            `${path}[${index}].variables must be an object when provided.`,
          );
        }
      } else {
        throw new Error(
          `${path}[${index}].type must be either "bundle" or "template".`,
        );
      }
    });
  }

  private validateProviderProfiles(
    profiles: Record<string, ProviderProfileConfig> | undefined,
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
          `providers.${key}.provider must be an object with provider settings.`,
        );
      }

      const providerName = (providerDescriptor as ProviderConfig).name;
      if (typeof providerName !== "string" || providerName.trim() === "") {
        throw new Error(
          `providers.${key}.provider.name must be a non-empty string.`,
        );
      }

      const profileModel = (profile as ProviderProfileConfig).model;
      if (
        typeof profileModel !== "undefined" &&
        (typeof profileModel !== "string" || profileModel.trim() === "")
      ) {
        throw new Error(
          `providers.${key}.model must be a non-empty string when provided.`,
        );
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
          `tools.sources[${index}].type must be the literal string "mcp".`,
        );
      }

      if (typeof source.id !== "string" || source.id.trim() === "") {
        throw new Error(
          `tools.sources[${index}].id must be provided as a non-empty string.`,
        );
      }

      if (typeof source.url !== "string" || source.url.trim() === "") {
        throw new Error(
          `tools.sources[${index}].url must be provided as a non-empty string.`,
        );
      }

      if (
        typeof source.name !== "undefined" &&
        (typeof source.name !== "string" || source.name.trim() === "")
      ) {
        throw new Error(
          `tools.sources[${index}].name must be a non-empty string when provided.`,
        );
      }

      if (typeof source.headers !== "undefined") {
        if (
          !source.headers ||
          typeof source.headers !== "object" ||
          Array.isArray(source.headers)
        ) {
          throw new Error(
            `tools.sources[${index}].headers must be an object with string values when provided.`,
          );
        }

        for (const [key, value] of Object.entries(source.headers)) {
          if (typeof value !== "string") {
            throw new Error(
              `tools.sources[${index}].headers.${key} must be a string.`,
            );
          }
        }
      }

      if (typeof source.auth !== "undefined") {
        const auth = source.auth;
        if (!auth || typeof auth !== "object") {
          throw new Error(
            `tools.sources[${index}].auth must be an object when provided.`,
          );
        }

        if (auth.type === "basic") {
          if (
            typeof auth.username !== "string" ||
            auth.username.trim() === "" ||
            typeof auth.password !== "string"
          ) {
            throw new Error(
              `tools.sources[${index}].auth must include non-empty username and password for basic auth.`,
            );
          }
        } else if (auth.type === "bearer") {
          if (typeof auth.token !== "string" || auth.token.trim() === "") {
            throw new Error(
              `tools.sources[${index}].auth.token must be a non-empty string for bearer auth.`,
            );
          }
        } else if (auth.type === "none") {
          // nothing additional
        } else {
          throw new Error(
            `tools.sources[${index}].auth.type must be one of "basic", "bearer", or "none".`,
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
          `tools.sources[${index}].capabilities must be an object when provided.`,
        );
      }
    });
  }
}

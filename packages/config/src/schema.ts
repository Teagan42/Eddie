import type { JSONSchema7 } from "json-schema";

export const EDDIE_CONFIG_SCHEMA_ID =
  "https://eddie.sh/schemas/eddie-config.schema.json";
export const EDDIE_CONFIG_INPUT_SCHEMA_ID =
  "https://eddie.sh/schemas/eddie-config-input.schema.json";

const LOG_LEVEL_SCHEMA: JSONSchema7 = {
  type: "string",
  enum: ["silent", "info", "debug"],
};

const STRING_OR_STRING_ARRAY_SCHEMA: JSONSchema7 = {
  oneOf: [
    { type: "string" },
    {
      type: "array",
      items: { type: "string" },
      minItems: 1,
    },
  ],
};

const TEMPLATE_DESCRIPTOR_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  required: ["file"],
  properties: {
    file: { type: "string", minLength: 1 },
    baseDir: { type: "string" },
    encoding: { type: "string" },
    variables: {
      type: "object",
      additionalProperties: true,
    },
  },
};

const PROVIDER_CONFIG_SCHEMA: JSONSchema7 = {
  type: "object",
  required: ["name"],
  additionalProperties: true,
  properties: {
    name: { type: "string", minLength: 1 },
    baseUrl: { type: "string", minLength: 1 },
    apiKey: { type: "string", minLength: 1 },
    version: { type: "string", minLength: 1 },
  },
};

const PROVIDER_CONFIG_INPUT_SCHEMA: JSONSchema7 = {
  ...PROVIDER_CONFIG_SCHEMA,
  required: [],
};

const PROVIDER_PROFILE_SCHEMA: JSONSchema7 = {
  type: "object",
  required: ["provider"],
  additionalProperties: false,
  properties: {
    provider: PROVIDER_CONFIG_SCHEMA,
    model: { type: "string" },
  },
};

const API_TELEMETRY_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: { type: "boolean" },
    consoleExporter: { type: "boolean" },
    exposeErrorStack: { type: "boolean" },
  },
};

const API_VALIDATION_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  properties: {
    whitelist: { type: "boolean" },
    forbidNonWhitelisted: { type: "boolean" },
    transform: { type: "boolean" },
    enableImplicitConversion: { type: "boolean" },
  },
};

const API_CACHE_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: { type: "boolean" },
    ttlSeconds: { type: "integer", minimum: 0 },
    maxItems: { type: "integer", minimum: 0 },
  },
};

const API_AUTH_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: { type: "boolean" },
    apiKeys: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
  },
};

const API_CORS_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: { type: "boolean" },
    origin: {
      oneOf: [
        { type: "boolean" },
        STRING_OR_STRING_ARRAY_SCHEMA,
      ],
    },
    methods: STRING_OR_STRING_ARRAY_SCHEMA,
    allowedHeaders: STRING_OR_STRING_ARRAY_SCHEMA,
    exposedHeaders: STRING_OR_STRING_ARRAY_SCHEMA,
    credentials: { type: "boolean" },
    maxAge: { type: "integer", minimum: 0 },
  },
};

const API_PERSISTENCE_SQLITE_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  properties: {
    filename: { type: "string" },
  },
};

const API_PERSISTENCE_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  required: ["driver"],
  properties: {
    driver: { enum: ["memory", "sqlite"] },
    sqlite: API_PERSISTENCE_SQLITE_SCHEMA,
  },
};

const API_CONFIG_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  properties: {
    host: { type: "string" },
    port: { type: "integer", minimum: 0 },
    telemetry: API_TELEMETRY_SCHEMA,
    validation: API_VALIDATION_SCHEMA,
    cache: API_CACHE_SCHEMA,
    auth: API_AUTH_SCHEMA,
    cors: API_CORS_SCHEMA,
    persistence: API_PERSISTENCE_SCHEMA,
  },
};

const LOGGING_DESTINATION_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  required: ["type"],
  properties: {
    type: { type: "string", enum: ["stdout", "stderr", "file"] },
    path: { type: "string" },
    pretty: { type: "boolean" },
    colorize: { type: "boolean" },
  },
};

const LOGGING_CONFIG_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  required: ["level"],
  properties: {
    level: LOG_LEVEL_SCHEMA,
    destination: LOGGING_DESTINATION_SCHEMA,
    enableTimestamps: { type: "boolean" },
  },
};

const CONTEXT_RESOURCE_BUNDLE_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  required: ["id", "type", "include"],
  properties: {
    id: { type: "string", minLength: 1 },
    type: { const: "bundle" },
    name: { type: "string" },
    description: { type: "string" },
    include: {
      type: "array",
      items: { type: "string", minLength: 1 },
      minItems: 1,
    },
    exclude: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    baseDir: { type: "string" },
    virtualPath: { type: "string" },
  },
};

const CONTEXT_RESOURCE_TEMPLATE_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  required: ["id", "type", "template"],
  properties: {
    id: { type: "string", minLength: 1 },
    type: { const: "template" },
    name: { type: "string" },
    description: { type: "string" },
    template: TEMPLATE_DESCRIPTOR_SCHEMA,
    variables: {
      type: "object",
      additionalProperties: true,
    },
  },
};

const CONTEXT_RESOURCE_SCHEMA: JSONSchema7 = {
  oneOf: [
    CONTEXT_RESOURCE_BUNDLE_SCHEMA,
    CONTEXT_RESOURCE_TEMPLATE_SCHEMA,
  ],
};

const CONTEXT_CONFIG_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  required: ["include"],
  properties: {
    include: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    exclude: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    baseDir: { type: "string" },
    maxBytes: { type: "integer", minimum: 0 },
    maxFiles: { type: "integer", minimum: 0 },
    variables: {
      type: "object",
      additionalProperties: true,
    },
    resources: {
      type: "array",
      items: CONTEXT_RESOURCE_SCHEMA,
    },
  },
};

const AGENT_PROVIDER_CONFIG_SCHEMA: JSONSchema7 = {
  oneOf: [
    { type: "string", minLength: 1 },
    PROVIDER_CONFIG_INPUT_SCHEMA,
  ],
};

const AGENT_MANAGER_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: true,
  required: ["prompt"],
  properties: {
    prompt: { type: "string", minLength: 1 },
    instructions: { type: "string" },
    promptTemplate: TEMPLATE_DESCRIPTOR_SCHEMA,
    defaultUserPromptTemplate: TEMPLATE_DESCRIPTOR_SCHEMA,
    variables: {
      type: "object",
      additionalProperties: true,
    },
    resources: {
      type: "array",
      items: CONTEXT_RESOURCE_SCHEMA,
    },
    model: { type: "string" },
    provider: AGENT_PROVIDER_CONFIG_SCHEMA,
  },
};

const AGENT_DEFINITION_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: true,
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 1 },
    name: { type: "string" },
    description: { type: "string" },
    prompt: { type: "string" },
    promptTemplate: TEMPLATE_DESCRIPTOR_SCHEMA,
    defaultUserPromptTemplate: TEMPLATE_DESCRIPTOR_SCHEMA,
    variables: {
      type: "object",
      additionalProperties: true,
    },
    resources: {
      type: "array",
      items: CONTEXT_RESOURCE_SCHEMA,
    },
    tools: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    routingThreshold: { type: "number" },
    model: { type: "string" },
    provider: AGENT_PROVIDER_CONFIG_SCHEMA,
  },
};

const AGENT_ROUTING_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: true,
  properties: {
    confidenceThreshold: { type: "number" },
    maxDepth: { type: "integer", minimum: 0 },
  },
};

const AGENTS_CONFIG_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  required: ["mode", "manager", "subagents", "enableSubagents"],
  properties: {
    mode: { type: "string", minLength: 1 },
    manager: AGENT_MANAGER_SCHEMA,
    subagents: {
      type: "array",
      items: AGENT_DEFINITION_SCHEMA,
    },
    routing: AGENT_ROUTING_SCHEMA,
    enableSubagents: { type: "boolean" },
  },
};

const OUTPUT_CONFIG_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  properties: {
    jsonlTrace: { type: "string" },
    jsonlAppend: { type: "boolean" },
    directory: { type: "string" },
    prettyStream: { type: "boolean" },
  },
};

const MCP_BASIC_AUTH_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  required: ["type", "username", "password"],
  properties: {
    type: { const: "basic" },
    username: { type: "string", minLength: 1 },
    password: { type: "string", minLength: 1 },
  },
};

const MCP_BEARER_AUTH_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  required: ["type", "token"],
  properties: {
    type: { const: "bearer" },
    token: { type: "string", minLength: 1 },
  },
};

const MCP_NO_AUTH_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  required: ["type"],
  properties: {
    type: { const: "none" },
  },
};

const MCP_AUTH_SCHEMA: JSONSchema7 = {
  oneOf: [
    MCP_BASIC_AUTH_SCHEMA,
    MCP_BEARER_AUTH_SCHEMA,
    MCP_NO_AUTH_SCHEMA,
  ],
};

const MCP_TOOL_SOURCE_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  required: ["id", "type", "url"],
  properties: {
    id: { type: "string", minLength: 1 },
    type: { const: "mcp" },
    url: { type: "string", minLength: 1 },
    name: { type: "string" },
    headers: {
      type: "object",
      additionalProperties: { type: "string" },
    },
    auth: MCP_AUTH_SCHEMA,
    capabilities: {
      type: "object",
      additionalProperties: true,
      properties: {
        tools: {
          type: "object",
          additionalProperties: true,
        },
        resources: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
};

const TOOLS_CONFIG_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    disabled: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    autoApprove: { type: "boolean" },
    sources: {
      type: "array",
      items: MCP_TOOL_SOURCE_SCHEMA,
    },
  },
};

const HOOKS_CONFIG_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  properties: {
    modules: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    directory: { type: "string" },
  },
};

const TOKENIZER_CONFIG_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  properties: {
    provider: { type: "string" },
  },
};

export const EDDIE_CONFIG_SCHEMA: JSONSchema7 = {
  $id: EDDIE_CONFIG_SCHEMA_ID,
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  required: [
    "model",
    "provider",
    "context",
    "systemPrompt",
    "logLevel",
    "agents",
  ],
  properties: {
    model: { type: "string", minLength: 1 },
    provider: PROVIDER_CONFIG_SCHEMA,
    providers: {
      type: "object",
      additionalProperties: PROVIDER_PROFILE_SCHEMA,
    },
    context: CONTEXT_CONFIG_SCHEMA,
    api: API_CONFIG_SCHEMA,
    systemPrompt: { type: "string", minLength: 1 },
    logLevel: LOG_LEVEL_SCHEMA,
    logging: LOGGING_CONFIG_SCHEMA,
    output: OUTPUT_CONFIG_SCHEMA,
    tools: TOOLS_CONFIG_SCHEMA,
    hooks: HOOKS_CONFIG_SCHEMA,
    tokenizer: TOKENIZER_CONFIG_SCHEMA,
    agents: AGENTS_CONFIG_SCHEMA,
  },
};

export const EDDIE_CONFIG_INPUT_SCHEMA: JSONSchema7 = {
  $id: EDDIE_CONFIG_INPUT_SCHEMA_ID,
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  properties: {
    model: { type: "string", minLength: 1 },
    provider: PROVIDER_CONFIG_INPUT_SCHEMA,
    providers: {
      type: "object",
      additionalProperties: PROVIDER_PROFILE_SCHEMA,
    },
    context: {
      ...CONTEXT_CONFIG_SCHEMA,
      required: [],
    },
    api: API_CONFIG_SCHEMA,
    systemPrompt: { type: "string" },
    logLevel: LOG_LEVEL_SCHEMA,
    logging: {
      ...LOGGING_CONFIG_SCHEMA,
      required: [],
    },
    output: OUTPUT_CONFIG_SCHEMA,
    tools: TOOLS_CONFIG_SCHEMA,
    hooks: HOOKS_CONFIG_SCHEMA,
    tokenizer: TOKENIZER_CONFIG_SCHEMA,
    agents: {
      ...AGENTS_CONFIG_SCHEMA,
      required: [],
    },
  },
};

export interface EddieConfigSchemaBundle {
  id: string;
  version: string;
  schema: JSONSchema7;
  inputSchema: JSONSchema7;
}

export const EDDIE_CONFIG_SCHEMA_BUNDLE: EddieConfigSchemaBundle = {
  id: EDDIE_CONFIG_SCHEMA_ID,
  version: "1.0.0",
  schema: EDDIE_CONFIG_SCHEMA,
  inputSchema: EDDIE_CONFIG_INPUT_SCHEMA,
};

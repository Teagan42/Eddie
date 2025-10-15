import { builtinTools } from "@eddie/tools";
import type { EddieConfig } from "./types";
import { LATEST_CONFIG_VERSION } from "./migrations";

const BUILTIN_TOOL_NAMES = Object.freeze(
  builtinTools.map((tool) => tool.name),
);

export const DEFAULT_SYSTEM_PROMPT = `You are Eddie, a CLI coding assistant.

Use the builtin tools to explore the filesystem safely:
- Prefer the \`bash\` tool for navigation commands such as \`pwd\`, \`ls\`, \`cd\`, and \`find\`.
- Use \`file_read\` to inspect file contents and \`file_write\` to apply edits.
- Favor \`rg\` over recursive \`ls\` or \`grep -R\` when searching.`;

export const DEFAULT_CONFIG: EddieConfig = {
  version: LATEST_CONFIG_VERSION,
  projectDir: process.cwd(),
  model: "gpt-4o-mini",
  provider: {
    name: "openai",
  },
  context: {
    include: ["src/**/*"],
    baseDir: process.cwd(),
  },
  api: {
    host: "0.0.0.0",
    port: 3000,
    telemetry: {
      enabled: false,
      consoleExporter: true,
      exposeErrorStack: false,
    },
    validation: {
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      enableImplicitConversion: true,
    },
    cache: {
      enabled: true,
      ttlSeconds: 5,
      maxItems: 128,
    },
    auth: {
      enabled: false,
      apiKeys: [],
    },
    cors: {
      enabled: true,
      origin: true,
      credentials: true,
    },
    persistence: {
      driver: "memory",
    },
  },
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  logLevel: "info",
  logging: {
    level: "info",
    destination: {
      type: "stdout",
      pretty: true,
      colorize: true,
    },
    enableTimestamps: true,
  },
  output: {
    jsonlTrace: ".eddie/trace.jsonl",
    jsonlAppend: true,
    prettyStream: true,
  },
  tools: {
    enabled: [...BUILTIN_TOOL_NAMES],
    autoApprove: false,
    sources: [],
  },
  hooks: {
    modules: [],
  },
  tokenizer: {
    provider: "openai",
  },
  agents: {
    mode: "single",
    manager: {
      prompt: DEFAULT_SYSTEM_PROMPT,
    },
    subagents: [],
    routing: {
      confidenceThreshold: 0.5,
    },
    enableSubagents: true,
  },
  transcript: {},
};

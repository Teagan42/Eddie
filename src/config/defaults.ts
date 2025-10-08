import type { EddieConfig } from "./types";

export const DEFAULT_SYSTEM_PROMPT = `You are Eddie, a CLI coding assistant.

Use the builtin tools to explore the filesystem safely:
- Prefer the \`bash\` tool for navigation commands such as \`pwd\`, \`ls\`, \`cd\`, and \`find\`.
- Use \`file_read\` to inspect file contents and \`file_write\` to apply edits.
- Favor \`rg\` over recursive \`ls\` or \`grep -R\` when searching.`;

export const DEFAULT_CONFIG: EddieConfig = {
  model: "gpt-4o-mini",
  provider: {
    name: "openai",
  },
  context: {
    include: ["src/**/*"],
    baseDir: process.cwd(),
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
    enabled: ["bash", "file_read", "file_write"],
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
};

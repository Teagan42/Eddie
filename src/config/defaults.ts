import type { EddieConfig } from "./types";

export const DEFAULT_SYSTEM_PROMPT = "You are Eddie, a CLI coding assistant.";

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
  output: {
    jsonlTrace: ".eddie/trace.jsonl",
    jsonlAppend: true,
    prettyStream: true,
  },
  tools: {
    enabled: ["bash", "file_read", "file_write"],
    autoApprove: false,
  },
  hooks: {
    modules: [],
  },
  tokenizer: {
    provider: "openai",
  },
};

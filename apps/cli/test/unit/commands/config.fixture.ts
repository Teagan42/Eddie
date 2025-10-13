import type { EddieConfig } from "@eddie/config";

export function createBaseConfig(): EddieConfig {
  return {
    model: "base-model",
    provider: { name: "provider" },
    projectDir: "/tmp/project",
    context: { include: [], baseDir: "/tmp/project" },
    api: undefined,
    systemPrompt: "You are Eddie.",
    logLevel: "info",
    logging: { level: "info" },
    output: { jsonlAppend: true },
    tools: { enabled: [], disabled: [], autoApprove: false },
    hooks: {},
    tokenizer: { provider: "provider" },
    agents: {
      mode: "manager",
      manager: { prompt: "Manage the run." },
      subagents: [],
      enableSubagents: false,
    },
    transcript: {},
  };
}

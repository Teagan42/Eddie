import type { EddieConfigInput } from "../types";

export const demoWebPreset: EddieConfigInput = {
  demoSeeds: {
    chatSessions: "examples/demo-agent-screenshots/data/chat-sessions.json",
    agentInvocations: "examples/demo-agent-screenshots/data/agent-invocations.json",
    traces: "examples/demo-agent-screenshots/data/traces.json",
    logs: "examples/demo-agent-screenshots/data/logs.json",
    runtimeConfig: "examples/demo-agent-screenshots/data/runtime-config.json",
  },
};

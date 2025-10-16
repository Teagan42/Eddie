import type {
  TranscriptCompactor,
  TranscriptCompactorConfig,
} from "../transcript-compactors";
import type { EddieConfig } from "@eddie/types";

export interface TranscriptCompactionSettings {
  global?: TranscriptCompactorConfig;
  agents: Record<string, TranscriptCompactorConfig | undefined>;
}

export type TranscriptCompactionSettingsLoader = () => TranscriptCompactionSettings;

export type TranscriptCompactorFactoryFn = (
  config: TranscriptCompactorConfig,
  context: { agentId: string },
) => TranscriptCompactor;

export const TRANSCRIPT_COMPACTION_SETTINGS = Symbol("TRANSCRIPT_COMPACTION_SETTINGS");

export const TRANSCRIPT_COMPACTOR_FACTORY = Symbol("TRANSCRIPT_COMPACTOR_FACTORY");

export function extractTranscriptCompactionSettings(
  config: EddieConfig,
): TranscriptCompactionSettings {
  const agents: Record<string, TranscriptCompactorConfig | undefined> = {
    manager: config.agents.manager.transcript?.compactor,
  };

  for (const subagent of config.agents.subagents) {
    agents[subagent.id] = subagent.transcript?.compactor;
  }

  return {
    global: config.transcript?.compactor,
    agents,
  };
}

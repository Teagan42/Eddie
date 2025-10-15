import type { AgentInvocation } from "../agents/agent-invocation";
import type { AgentRuntimeDescriptor } from "../agents/agent-runtime.types";
import type {
  TranscriptCompactorConfig as ConfigTranscriptCompactorConfig,
  SimpleTranscriptCompactorConfig as ConfigSimpleTranscriptCompactorConfig,
  SummarizerTranscriptCompactorConfig as ConfigSummarizerTranscriptCompactorConfig,
  IntelligentTranscriptCompactorConfig as ConfigIntelligentTranscriptCompactorConfig,
  AgentContextRequirements as ConfigAgentContextRequirements,
  TokenBudgetTranscriptCompactorConfig as ConfigTokenBudgetTranscriptCompactorConfig,
} from "@eddie/config";

export interface TranscriptCompactionResult {
  removedMessages?: number;
}

export interface TranscriptCompactionPlan {
  reason?: string;
  apply():
    | Promise<TranscriptCompactionResult | void>
    | TranscriptCompactionResult
    | void;
}

export interface TranscriptCompactor {
  plan(
    invocation: AgentInvocation,
    iteration: number,
  ): Promise<TranscriptCompactionPlan | null | undefined> |
    TranscriptCompactionPlan |
    null |
    undefined;
}

export type TranscriptCompactorSelector =
  | TranscriptCompactor
  | ((
      invocation: AgentInvocation,
      descriptor: AgentRuntimeDescriptor,
    ) => TranscriptCompactor | null | undefined);

export type TranscriptCompactorConfig = ConfigTranscriptCompactorConfig;

export type SimpleTranscriptCompactorConfig = ConfigSimpleTranscriptCompactorConfig;

export type SummarizerTranscriptCompactorConfig =
  ConfigSummarizerTranscriptCompactorConfig;

export type IntelligentTranscriptCompactorConfig =
  ConfigIntelligentTranscriptCompactorConfig;

export type TokenBudgetTranscriptCompactorConfig =
  ConfigTokenBudgetTranscriptCompactorConfig;

export type AgentContextRequirements = ConfigAgentContextRequirements;

export interface TranscriptCompactorFactory<
  Config extends TranscriptCompactorConfig = TranscriptCompactorConfig,
> {
  strategy: Config["strategy"];
  create(
    config: Config,
    context: TranscriptCompactorFactoryContext,
  ): TranscriptCompactor;
}

export interface TranscriptCompactorFactoryContext {
  agentId: string;
}

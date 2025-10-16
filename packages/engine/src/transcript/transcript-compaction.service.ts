import { Injectable } from "@nestjs/common";
import type { AgentRuntimeDescriptor } from "@eddie/types";
import type { AgentInvocation } from "../agents/agent-invocation";
import type { AgentLifecyclePayload } from "@eddie/hooks";
import { HOOK_EVENTS } from "@eddie/hooks";
import type { HookBus } from "@eddie/hooks";
import type { EddieConfig, TranscriptCompactorConfig } from "@eddie/types";
import type { Logger } from "pino";
import type { TranscriptCompactor } from "../transcript-compactors";
import { createTranscriptCompactor } from "../transcript-compactors";

export interface TranscriptCompactionWorkflow {
  selectFor(
    invocation: AgentInvocation,
    descriptor?: AgentRuntimeDescriptor,
  ): TranscriptCompactor | null;
  planAndApply(
    compactor: TranscriptCompactor,
    invocation: AgentInvocation,
    iteration: number,
    runtime: { hooks: HookBus; logger: Logger },
    lifecycle: AgentLifecyclePayload,
  ): Promise<void>;
}

interface CachedCompactor {
  signature: string;
  compactor: TranscriptCompactor;
}

interface CompactionRuntime {
  hooks: HookBus;
  logger: Logger;
}

@Injectable()
export class TranscriptCompactionService {
  private readonly cache = new Map<string, CachedCompactor>();

  constructor(
    private readonly instantiate: typeof createTranscriptCompactor = createTranscriptCompactor,
  ) {}

  createSelector(config: EddieConfig): TranscriptCompactionWorkflow {
    const globalConfig = config.transcript?.compactor;
    const perAgentConfigs = this.collectAgentCompactorConfigs(config);

    return {
      selectFor: (invocation, descriptor) => {
        const agentId = descriptor?.id ?? invocation.definition.id;
        const agentConfig = perAgentConfigs.get(agentId);
        if (agentConfig) {
          return this.getOrCreate(agentId, agentConfig);
        }

        if (!globalConfig) {
          return null;
        }

        return this.getOrCreate("global", globalConfig);
      },
      planAndApply: async (compactor, invocation, iteration, runtime, lifecycle) =>
        this.planAndApply(compactor, invocation, iteration, runtime, lifecycle),
    };
  }

  private collectAgentCompactorConfigs(
    config: EddieConfig,
  ): Map<string, TranscriptCompactorConfig> {
    const result = new Map<string, TranscriptCompactorConfig>();
    const register = (agentId: string, compactor?: TranscriptCompactorConfig): void => {
      if (compactor) {
        result.set(agentId, compactor);
      }
    };

    register("manager", config.agents.manager.transcript?.compactor);

    for (const subagent of config.agents.subagents) {
      register(subagent.id, subagent.transcript?.compactor);
    }

    return result;
  }

  private async planAndApply(
    compactor: TranscriptCompactor,
    invocation: AgentInvocation,
    iteration: number,
    runtime: CompactionRuntime,
    lifecycle: AgentLifecyclePayload,
  ): Promise<void> {
    const plan = await compactor.plan(invocation, iteration);
    if (!plan) {
      return;
    }

    await this.emitPreCompact(plan.reason, invocation, iteration, lifecycle, runtime);
    const result = await plan.apply();

    if (result && typeof result === "object") {
      const removedMessages =
        typeof (result as { removedMessages?: unknown }).removedMessages === "number"
          ? (result as { removedMessages: number }).removedMessages
          : undefined;

      runtime.logger.debug(
        {
          agent: invocation.id,
          removedMessages,
          reason: plan.reason,
        },
        "Transcript compacted",
      );
    }
  }

  private async emitPreCompact(
    reason: string | undefined,
    invocation: AgentInvocation,
    iteration: number,
    lifecycle: AgentLifecyclePayload,
    runtime: CompactionRuntime,
  ): Promise<void> {
    await runtime.hooks.emitAsync(HOOK_EVENTS.preCompact, {
      ...lifecycle,
      iteration,
      messages: invocation.messages,
      reason,
    });
  }

  private getOrCreate(
    agentId: string,
    config: TranscriptCompactorConfig,
  ): TranscriptCompactor {
    const signature = TranscriptCompactionService.stableStringify(config);
    const cached = this.cache.get(agentId);
    if (cached && cached.signature === signature) {
      return cached.compactor;
    }

    const compactor = this.instantiate(config, { agentId });
    this.cache.set(agentId, { signature, compactor });
    return compactor;
  }

  private static stableStringify(value: unknown): string {
    if (value === null) {
      return "null";
    }

    if (typeof value !== "object") {
      return `${typeof value}:${String(value)}`;
    }

    if (Array.isArray(value)) {
      return `[${value.map((entry) => TranscriptCompactionService.stableStringify(entry)).join(",")}]`;
    }

    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${key}:${TranscriptCompactionService.stableStringify((value as Record<string, unknown>)[key])}`);

    return `{${entries.join(",")}}`;
  }
}

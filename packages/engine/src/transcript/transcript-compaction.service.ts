import { Inject, Injectable } from "@nestjs/common";
import { HOOK_EVENTS, type HookBus } from "@eddie/hooks";
import type {
  AgentLifecyclePayload,
  AgentTranscriptCompactionPayload,
} from "@eddie/hooks";
import type { Logger } from "pino";
import type { AgentInvocation } from "../agents/agent-invocation";
import type { AgentRuntimeDescriptor } from "../agents/agent-runtime.types";
import type {
  TranscriptCompactor,
  TranscriptCompactorSelector,
  TranscriptCompactorConfig,
} from "../transcript-compactors";
import {
  TRANSCRIPT_COMPACTION_SETTINGS,
  TRANSCRIPT_COMPACTOR_FACTORY,
  type TranscriptCompactorFactoryFn,
  type TranscriptCompactionSettingsLoader,
} from "./transcript-compaction.tokens";

const GLOBAL_AGENT_ID = "__global__";

interface CachedCompactor {
  signature: string;
  compactor: TranscriptCompactor;
}

export interface PlanAndApplyOptions {
  selector?: TranscriptCompactorSelector;
  invocation: AgentInvocation;
  descriptor: AgentRuntimeDescriptor;
  iteration: number;
  lifecycle: AgentLifecyclePayload;
  hooks: HookBus;
  logger: Logger;
}

@Injectable()
export class TranscriptCompactionService {
  private readonly cache = new Map<string, CachedCompactor>();

  constructor(
    @Inject(TRANSCRIPT_COMPACTION_SETTINGS)
    private readonly loadSettings: TranscriptCompactionSettingsLoader,
    @Inject(TRANSCRIPT_COMPACTOR_FACTORY)
    private readonly createCompactor: TranscriptCompactorFactoryFn,
  ) {}

  readonly selectFor = (
    invocation: AgentInvocation,
    descriptor?: AgentRuntimeDescriptor,
  ): TranscriptCompactor | undefined => {
    const settings = this.loadSettings();
    const agentId = descriptor?.id ?? invocation.definition.id;

    const agentConfig = settings.agents?.[agentId];
    if (agentConfig) {
      return this.getOrCreate(agentId, agentConfig);
    }

    if (settings.global) {
      return this.getOrCreate(GLOBAL_AGENT_ID, settings.global);
    }

    return undefined;
  };

  async planAndApply(options: PlanAndApplyOptions): Promise<void> {
    const compactor = this.resolveSelector(options);
    if (!compactor) {
      return;
    }

    const plan = await compactor.plan(options.invocation, options.iteration);
    if (!plan) {
      return;
    }

    const payload: AgentTranscriptCompactionPayload = {
      ...options.lifecycle,
      iteration: options.iteration,
      messages: options.invocation.messages,
      reason: plan.reason,
    };

    await options.hooks.emitAsync(HOOK_EVENTS.preCompact, payload);
    const result = await plan.apply();

    if (result && typeof result === "object") {
      options.logger.debug(
        {
          agent: options.invocation.id,
          removedMessages: result.removedMessages,
          reason: plan.reason,
        },
        "Transcript compacted",
      );
    }
  }

  private resolveSelector(options: PlanAndApplyOptions): TranscriptCompactor | undefined {
    if (!options.selector) {
      return this.selectFor(options.invocation, options.descriptor);
    }

    return typeof options.selector === "function"
      ? options.selector(options.invocation, options.descriptor) ?? undefined
      : options.selector;
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

    const compactor = this.createCompactor(config, { agentId });
    this.cache.set(agentId, { signature, compactor });
    return compactor;
  }

  private static stableStringify(value: unknown): string {
    if (value === null) {
      return "null";
    }

    if (typeof value !== "object") {
      return `${ typeof value }:${ String(value) }`;
    }

    if (Array.isArray(value)) {
      return `[${ value
        .map((entry) => TranscriptCompactionService.stableStringify(entry))
        .join(",") }]`;
    }

    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) =>
        `${ key }:${ TranscriptCompactionService.stableStringify((value as Record<string, unknown>)[key]) }`,
      );

    return `{${ entries.join(",") }}`;
  }
}

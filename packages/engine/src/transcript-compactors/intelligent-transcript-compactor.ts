import type { ChatMessage } from "@eddie/types";
import type { AgentInvocation } from "../agents/agent-invocation";
import type {
  TranscriptCompactor,
  TranscriptCompactionPlan,
  TranscriptCompactorFactory,
  IntelligentTranscriptCompactorConfig,
  AgentContextRequirements,
} from "./types";
import { registerTranscriptCompactor } from "./registry";

export interface TranscriptContextNode {
  agentId: string;
  invocation: AgentInvocation;
  fullHistory: ChatMessage[];
  compactedHistory?: ChatMessage[];
  summary?: ParentContextStore;
  children: TranscriptContextNode[];
}

export interface ParentContextStore {
  taskPlan?: string;
  decisions?: string[];
  findings?: string[];
  toolUsage?: Array<{
    toolName: string;
    count: number;
    lastResult?: string;
  }>;
}

export class IntelligentTranscriptCompactor implements TranscriptCompactor {
  private readonly parentContextStore = new WeakMap<
    AgentInvocation,
    ParentContextStore
  >();

  private readonly contextTree = new WeakMap<
    AgentInvocation,
    TranscriptContextNode
  >();

  private readonly parentNodeIndex = new WeakMap<
    AgentInvocation,
    TranscriptContextNode
  >();

  private readonly defaultAgentRequirements: Record<
    string,
    AgentContextRequirements
  > = {
      router: {
        needsTaskPlan: true,
        needsHistory: true,
        needsParentContext: false,
        maxHistoryMessages: 20,
        preserveToolPairs: true,
      },
      manager: {
        needsTaskPlan: false,
        needsHistory: true,
        needsParentContext: false,
        maxHistoryMessages: 5,
        preserveToolPairs: true,
      },
      red: {
        needsTaskPlan: false,
        needsHistory: false,
        needsParentContext: true,
        maxHistoryMessages: 5,
        preserveToolPairs: true,
      },
      green: {
        needsTaskPlan: false,
        needsHistory: false,
        needsParentContext: true,
        maxHistoryMessages: 5,
        preserveToolPairs: true,
      },
      refactor: {
        needsTaskPlan: false,
        needsHistory: false,
        needsParentContext: true,
        maxHistoryMessages: 5,
        preserveToolPairs: true,
      },
      quality_gates: {
        needsTaskPlan: false,
        needsHistory: true,
        needsParentContext: true,
        maxHistoryMessages: 10,
        preserveToolPairs: true,
      },
      planner: {
        needsTaskPlan: true,
        needsHistory: true,
        needsParentContext: false,
        maxHistoryMessages: 15,
        preserveToolPairs: false,
      },
      summariser: {
        needsTaskPlan: false,
        needsHistory: false,
        needsParentContext: true,
        maxHistoryMessages: 3,
        preserveToolPairs: false,
      },
    };

  constructor(private readonly config: IntelligentTranscriptCompactorConfig) {}

  private ensureNode(invocation: AgentInvocation): TranscriptContextNode {
    let node = this.contextTree.get(invocation);
    if (!node) {
      node = {
        agentId: invocation.definition.id,
        invocation,
        fullHistory: [...invocation.messages],
        compactedHistory: undefined,
        summary: undefined,
        children: [],
      };
      this.contextTree.set(invocation, node);
    }

    if (invocation.parent) {
      const parentNode =
        this.contextTree.get(invocation.parent) ??
        this.ensureNode(invocation.parent);
      if (!parentNode.children.some((child) => child.invocation === invocation)) {
        parentNode.children.push(node);
      }
      this.parentNodeIndex.set(invocation, parentNode);
    }

    return node;
  }

  private getNode(invocation: AgentInvocation): TranscriptContextNode | undefined {
    return this.contextTree.get(invocation);
  }

  private upsertSummary(
    invocation: AgentInvocation,
    summary: ParentContextStore,
  ): void {
    const node = this.ensureNode(invocation);
    node.summary = summary;
    if (invocation.parent) {
      this.parentContextStore.set(invocation.parent, summary);
    }
  }

  getContextSubtree(
    invocation: AgentInvocation,
  ): TranscriptContextNode | undefined {
    return this.getNode(invocation);
  }

  getFullHistory(invocation: AgentInvocation): ChatMessage[] | undefined {
    return this.getNode(invocation)?.fullHistory;
  }

  async plan(
    invocation: AgentInvocation,
    iteration: number,
  ): Promise<TranscriptCompactionPlan | null> {
    const messageCount = invocation.messages.length;
    const node = this.ensureNode(invocation);
    if (node.fullHistory.length < messageCount) {
      node.fullHistory = [...invocation.messages];
    }

    if (messageCount <= (this.config.minMessagesBeforeCompaction ?? 10)) {
      return null;
    }

    const agentRequirements = this.getAgentRequirements(invocation);

    if (this.config.enableParentContextStorage) {
      this.extractAndStoreParentContext(invocation);
    }

    return this.buildCompactionPlan(invocation, agentRequirements, iteration);
  }

  private getAgentRequirements(
    invocation: AgentInvocation,
  ): AgentContextRequirements {
    const agentId = invocation.definition.id.toLowerCase();

    if (this.config.agentContextRequirements) {
      for (const [pattern, customReqs] of Object.entries(
        this.config.agentContextRequirements,
      )) {
        if (agentId.includes(pattern.toLowerCase())) {
          const baseReqs = this.findDefaultRequirements(agentId);
          return { ...baseReqs, ...customReqs };
        }
      }
    }

    return this.findDefaultRequirements(agentId);
  }

  private findDefaultRequirements(agentId: string): AgentContextRequirements {
    for (const [type, requirements] of Object.entries(
      this.defaultAgentRequirements,
    )) {
      if (agentId.includes(type)) {
        return requirements;
      }
    }

    return {
      needsTaskPlan: false,
      needsHistory: true,
      needsParentContext: true,
      maxHistoryMessages: 8,
      preserveToolPairs: true,
    };
  }

  private extractAndStoreParentContext(invocation: AgentInvocation): void {
    const messages = invocation.messages;
    const store: ParentContextStore = {
      decisions: [],
      findings: [],
      toolUsage: [],
    };

    const taskPlanMessage = messages.find((msg) => {
      if (msg.role !== "assistant") {
        return false;
      }
      const content = typeof msg.content === "string" ? msg.content : "";
      const lower = content.toLowerCase();
      return (
        lower.includes("plan:") ||
        lower.includes("steps:") ||
        lower.includes("task breakdown")
      );
    });

    if (taskPlanMessage && typeof taskPlanMessage.content === "string") {
      store.taskPlan = this.extractTaskPlan(taskPlanMessage.content);
    }

    for (const msg of messages) {
      if (msg.role === "assistant" && typeof msg.content === "string") {
        const decisions = this.extractDecisions(msg.content);
        if (decisions.length > 0) {
          store.decisions!.push(...decisions);
        }
      }
    }

    for (const msg of messages) {
      if (
        (msg.role === "assistant" || msg.role === "tool") &&
        typeof msg.content === "string"
      ) {
        const findings = this.extractFindings(msg.content);
        if (findings.length > 0) {
          store.findings!.push(...findings);
        }
      }
    }

    const toolUsageMap = new Map<string, { count: number; lastResult?: string }>();
    for (const msg of messages) {
      if (msg.role === "tool" && msg.name && typeof msg.content === "string") {
        const existing = toolUsageMap.get(msg.name) ?? { count: 0 };
        existing.count += 1;
        existing.lastResult = msg.content.substring(0, 200);
        toolUsageMap.set(msg.name, existing);
      }
    }
    store.toolUsage = Array.from(toolUsageMap.entries()).map(
      ([toolName, data]) => ({
        toolName,
        ...data,
      }),
    );

    this.upsertSummary(invocation, store);
  }

  private extractTaskPlan(content: string): string {
    const lines = content.split("\n");
    const planLines: string[] = [];
    let inPlan = false;

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (
        lower.includes("plan:") ||
        lower.includes("steps:") ||
        lower.includes("task breakdown")
      ) {
        inPlan = true;
        planLines.push(line);
        continue;
      }

      if (inPlan) {
        if (line.trim().match(/^\d+\./) || line.trim().startsWith("-")) {
          planLines.push(line);
        } else if (line.trim() === "") {
          continue;
        } else {
          break;
        }
      }
    }

    return planLines.join("\n");
  }

  private extractDecisions(content: string): string[] {
    const decisions: string[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (
        lower.includes("decided") ||
        lower.includes("choosing") ||
        lower.includes("will use") ||
        lower.includes("approach:")
      ) {
        decisions.push(line.trim());
      }
    }

    return decisions;
  }

  private extractFindings(content: string): string[] {
    const findings: string[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (
        lower.includes("found") ||
        lower.includes("discovered") ||
        lower.includes("error:") ||
        lower.includes("warning:") ||
        lower.includes("success:")
      ) {
        findings.push(line.trim());
      }
    }

    return findings;
  }

  private buildCompactionPlan(
    invocation: AgentInvocation,
    requirements: AgentContextRequirements,
    iteration: number,
  ): TranscriptCompactionPlan {
    const messages = invocation.messages;
    const indicesToKeep = new Set<number>();
    indicesToKeep.add(0);

    let parentContext: ParentContextStore | undefined;
    if (requirements.needsParentContext && invocation.parent) {
      parentContext = this.parentContextStore.get(invocation.parent);
    }

    const assistantToolCalls = new Map<string, number>();
    const toolPairs = new Map<string, [number, number]>();
    if (requirements.preserveToolPairs) {
      for (let i = 1; i < messages.length; i += 1) {
        const msg = messages[i];
        if (msg.role === "assistant" && msg.tool_call_id) {
          assistantToolCalls.set(msg.tool_call_id, i);
        }
        if (msg.role === "tool" && msg.tool_call_id) {
          const assistantIndex = assistantToolCalls.get(msg.tool_call_id);
          if (assistantIndex !== undefined) {
            toolPairs.set(msg.tool_call_id, [assistantIndex, i]);
          }
        }
      }
    }

    let historyCount = 0;
    let capturedUserMessage = false;

    for (let i = messages.length - 1; i > 0; i -= 1) {
      const msg = messages[i];

      if (requirements.preserveToolPairs && msg.tool_call_id) {
        const pair = toolPairs.get(msg.tool_call_id);
        if (pair) {
          indicesToKeep.add(pair[0]);
          indicesToKeep.add(pair[1]);
          toolPairs.delete(msg.tool_call_id);
          continue;
        }
      }

      if (
        msg.role === "user" &&
        !capturedUserMessage &&
        (requirements.needsHistory || requirements.needsTaskPlan)
      ) {
        indicesToKeep.add(i);
        capturedUserMessage = true;
        continue;
      }

      if (
        requirements.needsHistory &&
        historyCount < requirements.maxHistoryMessages
      ) {
        indicesToKeep.add(i);
        historyCount += 1;
        continue;
      }

      if (
        requirements.needsTaskPlan &&
        msg.role === "assistant" &&
        typeof msg.content === "string" &&
        (msg.content.toLowerCase().includes("plan:") ||
          msg.content.toLowerCase().includes("steps:"))
      ) {
        indicesToKeep.add(i);
        continue;
      }
    }

    const messagesToKeep = messages
      .map((message, index) => ({ message, index }))
      .filter(({ index }) => indicesToKeep.has(index))
      .map(({ message }) => message);

    let removedCount = messages.length - messagesToKeep.length;

    if (requirements.needsParentContext && invocation.parent) {
      let aggregate: ParentContextStore =
        parentContext ?? {
          decisions: [],
          findings: [],
          toolUsage: [],
        };

      const parentNode = this.getNode(invocation.parent);
      if (parentNode?.summary) {
        this.mergeSummary(aggregate, parentNode.summary);
      }

      if (parentNode) {
        const childSummaries = parentNode.children
          .map((child) => child.summary)
          .filter((summary): summary is ParentContextStore => Boolean(summary));

        for (const summary of childSummaries) {
          this.mergeSummary(aggregate, summary);
        }
      }

      if (
        aggregate.taskPlan ||
        (aggregate.decisions && aggregate.decisions.length > 0) ||
        (aggregate.findings && aggregate.findings.length > 0) ||
        (aggregate.toolUsage && aggregate.toolUsage.length > 0)
      ) {
        const contextMessage = this.buildParentContextMessage(aggregate);
        messagesToKeep.splice(1, 0, contextMessage);
        removedCount = messages.length - (messagesToKeep.length - 1);
      }
    }

    return {
      reason: `Compacted transcript for ${invocation.definition.id} (iteration ${iteration}): removed ${removedCount} messages, retained ${messagesToKeep.length} messages tailored for agent type`,
      apply: () => {
        const node = this.ensureNode(invocation);
        node.compactedHistory = [...messagesToKeep];
        invocation.messages.splice(0, invocation.messages.length, ...messagesToKeep);
        return { removedMessages: removedCount };
      },
    };
  }

  private buildParentContextMessage(context: ParentContextStore): ChatMessage {
    const parts: string[] = [];

    if (context.taskPlan) {
      parts.push(`## Task Plan (from parent agent)\n${context.taskPlan}`);
    }

    if (context.decisions && context.decisions.length > 0) {
      parts.push(
        `## Key Decisions\n${context.decisions
          .map((decision) => `- ${decision}`)
          .join("\n")}`,
      );
    }

    if (context.findings && context.findings.length > 0) {
      parts.push(
        `## Important Findings\n${context.findings
          .map((finding) => `- ${finding}`)
          .join("\n")}`,
      );
    }

    if (context.toolUsage && context.toolUsage.length > 0) {
      parts.push(
        `## Tool Usage Summary\n${context.toolUsage
          .map((tool) => {
            const last = tool.lastResult ? ` (last: ${tool.lastResult})` : "";
            return `- ${tool.toolName}: used ${tool.count} time(s)${last}`;
          })
          .join("\n")}`,
      );
    }

    return {
      role: "system",
      content: parts.join("\n\n"),
    };
  }

  private mergeSummary(
    target: ParentContextStore,
    source?: ParentContextStore,
  ): void {
    if (!source) {
      return;
    }

    if (source.taskPlan && !target.taskPlan) {
      target.taskPlan = source.taskPlan;
    }

    if (source.decisions && source.decisions.length > 0) {
      target.decisions ??= [];
      target.decisions.push(...source.decisions);
    }

    if (source.findings && source.findings.length > 0) {
      target.findings ??= [];
      target.findings.push(...source.findings);
    }

    if (source.toolUsage && source.toolUsage.length > 0) {
      target.toolUsage ??= [];
      target.toolUsage.push(...source.toolUsage);
    }
  }

  getParentContext(invocation: AgentInvocation): ParentContextStore | undefined {
    return this.parentContextStore.get(invocation);
  }

  snapshotContext(
    invocation: AgentInvocation,
  ): Omit<TranscriptContextNode, "children"> & { children: any[] } | undefined {
    const node = this.getNode(invocation);
    if (!node) {
      return undefined;
    }

    const clone = (current: TranscriptContextNode): any => ({
      agentId: current.agentId,
      invocation: current.invocation,
      fullHistory: [...current.fullHistory],
      compactedHistory: current.compactedHistory
        ? [...current.compactedHistory]
        : undefined,
      summary: current.summary
        ? {
          ...current.summary,
          toolUsage: current.summary.toolUsage
            ? [...current.summary.toolUsage]
            : undefined,
        }
        : undefined,
      children: current.children.map(clone),
    });

    return clone(node);
  }
}

const factory: TranscriptCompactorFactory<IntelligentTranscriptCompactorConfig> = {
  strategy: "intelligent",
  create: (config) => new IntelligentTranscriptCompactor(config),
};

registerTranscriptCompactor(factory, { builtin: true });

export const IntelligentTranscriptCompactorStrategy = factory.strategy;

import { createHash } from "node:crypto";

import { Injectable, Optional, type OnModuleInit } from "@nestjs/common";
import { ConfigStore } from "@eddie/config";
import type {
  AgentInvocationMessageSnapshot,
  AgentInvocationSnapshot,
} from "@eddie/types";

import {
  loadDemoLogsFixture,
  loadDemoSessionsFixture,
  loadDemoTracesFixture,
} from "./demo-data.loader";
import type {
  DemoAgentInvocationTreeNode,
  DemoLogsFixtureFile,
  DemoSessionFixture,
  DemoSessionsFixtureFile,
  DemoTracesFixtureFile,
} from "./demo-data.schema";
import {
  ChatSessionsService,
  type ChatSessionSnapshotInput,
} from "../chat-sessions/chat-sessions.service";
import { ChatMessageRole } from "../chat-sessions/dto/create-chat-message.dto";
import {
  LogsService,
  MAX_LOG_ENTRIES,
  type SeedLogEntryInput,
} from "../logs/logs.service";
import {
  TracesService,
  type TraceSeedInput,
} from "../traces/traces.service";

interface ExistingIds {
  sessions: Set<string>;
  logs: Set<string>;
  traces: Set<string>;
}

@Injectable()
export class DemoDataSeeder implements OnModuleInit {
  constructor(
    @Optional() private readonly configStore: ConfigStore | undefined,
    private readonly chatSessionsService: ChatSessionsService,
    private readonly logsService: LogsService,
    private readonly tracesService: TracesService
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.configStore) {
      return;
    }

    const snapshot = this.configStore.getSnapshot();
    const files = snapshot.api?.demoSeeds?.files;
    if (!files || files.length === 0) {
      return;
    }

    const existing: ExistingIds = {
      sessions: new Set(
        (await this.chatSessionsService.listSessions()).map((session) => session.id)
      ),
      logs: new Set(
        this.logsService
          .list({ limit: MAX_LOG_ENTRIES })
          .map((entry) => entry.id)
      ),
      traces: new Set(this.tracesService.list().map((trace) => trace.id)),
    };

    for (const file of files) {
      await this.seedFromFile(file, existing);
    }
  }

  private async seedFromFile(filePath: string, existing: ExistingIds): Promise<void> {
    const [sessionsFixture, tracesFixture, logsFixture] = await Promise.all([
      loadDemoSessionsFixture(filePath),
      loadDemoTracesFixture(filePath),
      loadDemoLogsFixture(filePath),
    ]);

    await this.seedSessions(sessionsFixture, existing.sessions);
    this.seedLogs(logsFixture, existing.logs);
    this.seedTraces(tracesFixture, existing.traces);
  }

  private async seedSessions(
    fixture: DemoSessionsFixtureFile,
    existingIds: Set<string>
  ): Promise<void> {
    for (const session of fixture.sessions) {
      if (existingIds.has(session.id)) {
        continue;
      }

      const snapshot = this.buildSessionSnapshot(session);
      await this.chatSessionsService.seedSessionSnapshot(snapshot);
      existingIds.add(session.id);
    }
  }

  private buildSessionSnapshot(
    session: DemoSessionFixture
  ): ChatSessionSnapshotInput {
    const baseTimestamp = Date.parse(session.createdAt);
    const messages = this.buildSessionMessages(session, baseTimestamp);

    const updatedAt =
      messages.length > 0
        ? messages[messages.length - 1]?.createdAt
        : session.createdAt;

    const agentInvocations = session.agentInvocationTree
      ? [this.buildInvocationSnapshot(session.agentInvocationTree)]
      : undefined;

    const snapshot: ChatSessionSnapshotInput = {
      session: {
        id: session.id,
        title: session.title,
        status: "active",
        createdAt: session.createdAt,
        updatedAt,
      },
      messages,
    };

    if (agentInvocations) {
      snapshot.agentInvocations = agentInvocations;
    }

    return snapshot;
  }

  private buildSessionMessages(
    session: DemoSessionFixture,
    baseTimestamp: number
  ): ChatSessionSnapshotInput["messages"] {
    return session.messages.map((message, index) => ({
      id: message.id,
      sessionId: session.id,
      role: this.toChatMessageRole(message.role),
      content: message.content,
      createdAt: new Date(baseTimestamp + index * 1_000).toISOString(),
    }));
  }

  private toChatMessageRole(role: string): ChatMessageRole {
    switch (role) {
      case ChatMessageRole.User:
      case ChatMessageRole.Assistant:
      case ChatMessageRole.System:
      case ChatMessageRole.Tool:
        return role;
      default:
        return ChatMessageRole.User;
    }
  }

  private buildInvocationSnapshot(
    node: DemoAgentInvocationTreeNode
  ): AgentInvocationSnapshot {
    return {
      id: node.id,
      messages: this.buildInvocationMessages(node),
      children: (node.children ?? []).map((child) =>
        this.buildInvocationSnapshot(child)
      ),
    };
  }

  private buildInvocationMessages(
    node: DemoAgentInvocationTreeNode
  ): AgentInvocationMessageSnapshot[] {
    const messages: AgentInvocationMessageSnapshot[] = [
      {
        role: "assistant",
        content: `${node.agent} (${node.status})`,
      },
    ];

    if (node.tool) {
      messages.push({
        role: "tool",
        name: node.tool,
        content: this.stringifyOutput(node.output),
      });
    } else if (node.output !== undefined) {
      messages.push({
        role: "assistant",
        content: this.stringifyOutput(node.output),
      });
    }

    return messages;
  }

  private stringifyOutput(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private seedLogs(fixture: DemoLogsFixtureFile, existingIds: Set<string>): void {
    for (const entry of fixture.entries) {
      const id = this.createStableId("log", {
        timestamp: entry.timestamp,
        level: entry.level,
        message: entry.message,
        context: entry.context ?? null,
      });

      if (existingIds.has(id)) {
        continue;
      }

      const seed: SeedLogEntryInput = {
        id,
        level: entry.level as SeedLogEntryInput["level"],
        message: entry.message,
        context: entry.context,
        createdAt: entry.timestamp,
      };

      this.logsService.seedEntry(seed);
      existingIds.add(id);
    }
  }

  private seedTraces(
    fixture: DemoTracesFixtureFile,
    existingIds: Set<string>
  ): void {
    if (fixture.events.length === 0) {
      return;
    }

    const sorted = fixture.events
      .slice()
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

    const id = this.createStableId("trace", sorted);
    if (existingIds.has(id)) {
      return;
    }

    const createdAt = sorted[0]?.timestamp ?? new Date().toISOString();
    const updatedAt = sorted[sorted.length - 1]?.timestamp ?? createdAt;
    const durationMs =
      new Date(updatedAt).getTime() - new Date(createdAt).getTime();

    const metadata = {
      events: sorted.map((event) => ({
        id: event.id,
        type: event.type,
        timestamp: event.timestamp,
        payload: this.clonePayload(event.payload),
      })),
    } as Record<string, unknown>;

    const seed: TraceSeedInput = {
      id,
      name: sorted[sorted.length - 1]?.type ?? "demo-trace",
      status: "completed",
      durationMs: durationMs >= 0 ? durationMs : undefined,
      metadata,
      createdAt,
      updatedAt,
    };

    this.tracesService.seedTrace(seed);
    existingIds.add(id);
  }

  private clonePayload(payload: unknown): unknown {
    try {
      return structuredClone(payload);
    } catch {
      return JSON.parse(JSON.stringify(payload));
    }
  }

  private createStableId(prefix: string, value: unknown): string {
    const hash = createHash("sha256");
    hash.update(JSON.stringify(value));
    return `${prefix}-${hash.digest("hex")}`;
  }
}

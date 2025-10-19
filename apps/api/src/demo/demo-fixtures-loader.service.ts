import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigStore } from "@eddie/config";
import { LoggerService } from "@eddie/io";
import {
  CHAT_SESSIONS_REPOSITORY,
  InMemoryChatSessionsRepository,
  type ChatSessionsRepository,
  type InMemoryChatSessionsSnapshotEntry,
} from "../chat-sessions/chat-sessions.repository";
import { ChatMessageRole } from "../chat-sessions/dto/create-chat-message.dto";
import { TracesService, type TraceSnapshotSeed } from "../traces/traces.service";
import { LogsService, type LogEntrySeed } from "../logs/logs.service";
import { RuntimeConfigService } from "../runtime-config/runtime-config.service";
import {
  type DemoFixtures,
  type DemoFixtureChatSession,
  type DemoFixtureLogEntry,
  type DemoFixtureTrace,
  DemoFixturesError,
  readDemoFixtures,
  resolveDemoFixturesPath,
} from "./demo-fixtures";

@Injectable()
export class DemoFixturesLoader implements OnModuleInit {
  constructor(
    private readonly configStore: ConfigStore,
    @Inject(CHAT_SESSIONS_REPOSITORY)
    private readonly chatSessionsRepository: ChatSessionsRepository,
    private readonly tracesService: TracesService,
    private readonly logsService: LogsService,
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  private get logger() {
    return this.loggerService.getLogger("DemoFixturesLoader");
  }

  private toDate(value: string): Date {
    return new Date(value);
  }

  async onModuleInit(): Promise<void> {
    const config = this.configStore.getSnapshot();
    const demoConfig = config.api?.demo;
    if (!demoConfig?.enabled) {
      return;
    }

    const driver = config.api?.persistence?.driver ?? "memory";
    if (driver !== "memory") {
      this.logger.warn(
        {
          driver,
        },
        "api.demo is enabled but requires the in-memory persistence driver; skipping fixture hydration."
      );
      return;
    }

    const fixturesPath = demoConfig.fixtures?.path;
    if (!fixturesPath) {
      this.logger.warn(
        "api.demo.enabled is true but api.demo.fixtures.path is not configured; skipping fixture hydration."
      );
      return;
    }

    const projectDir = config.projectDir ?? process.cwd();
    const resolvedPath = resolveDemoFixturesPath(projectDir, fixturesPath);
    let fixtures: DemoFixtures;
    try {
      fixtures = await readDemoFixtures(resolvedPath);
    } catch (error) {
      const message =
        error instanceof DemoFixturesError ? error.message : "Failed to load demo fixtures.";
      this.logger.error({ err: error }, message);
      return;
    }

    this.seedChatSessions(fixtures.chatSessions);
    this.seedTraces(fixtures.traces);
    this.seedLogs(fixtures.logs);
    this.runtimeConfigService.seed(fixtures.runtime.config);
    this.logger.info({ path: resolvedPath }, "Demo fixtures hydrated successfully.");
  }

  private seedChatSessions(snapshots: DemoFixtureChatSession[]): void {
    const repository = this.chatSessionsRepository;
    if (!(repository instanceof InMemoryChatSessionsRepository)) {
      this.logger.warn(
        "In-memory chat sessions repository is required to hydrate demo fixtures; skipping session hydration."
      );
      return;
    }

    const entries: InMemoryChatSessionsSnapshotEntry[] = snapshots.map((snapshot) => ({
      session: {
        ...snapshot.session,
        createdAt: this.toDate(snapshot.session.createdAt),
        updatedAt: this.toDate(snapshot.session.updatedAt),
      },
      messages: snapshot.messages.map((message) => ({
        id: message.id,
        sessionId: message.sessionId,
        role: message.role as ChatMessageRole,
        content: message.content,
        createdAt: this.toDate(message.createdAt),
        toolCallId: message.toolCallId,
        name: message.name,
      })),
      agentInvocations: snapshot.agentInvocations ?? [],
    }));

    repository.resetFromSnapshot(entries);
  }

  private seedTraces(traces: DemoFixtureTrace[]): void {
    const snapshot: TraceSnapshotSeed[] = traces.map((trace) => ({
      id: trace.id,
      sessionId: trace.sessionId,
      name: trace.name,
      status: trace.status,
      durationMs: trace.durationMs,
      metadata: trace.metadata,
      createdAt: this.toDate(trace.createdAt),
      updatedAt: this.toDate(trace.updatedAt),
    }));
    this.tracesService.replaceAll(snapshot);
  }

  private seedLogs(logs: DemoFixtureLogEntry[]): void {
    const entries: LogEntrySeed[] = logs.map((log) => ({
      id: log.id,
      level: log.level,
      message: log.message,
      context: log.context,
      createdAt: this.toDate(log.createdAt),
    }));
    this.logsService.replaceAll(entries);
  }
}

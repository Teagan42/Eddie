import "reflect-metadata";
import { createHash } from "node:crypto";
import { demoFixturePath, readDemoFixture } from "../support/demo-fixtures";

import type { DynamicModule } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { vi } from "vitest";
import { BehaviorSubject } from "rxjs";
import { ConfigStore, DEFAULT_CONFIG } from "@eddie/config";
import type { EddieConfig } from "@eddie/types";

import { ApiModule } from "../../../src/api.module";
import { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import {
  CHAT_SESSIONS_REPOSITORY,
  InMemoryChatSessionsRepository,
  type AgentInvocationSnapshot,
} from "../../../src/chat-sessions/chat-sessions.repository";
import type { ChatSessionDto } from "../../../src/chat-sessions/dto/chat-session.dto";
import { LogsService } from "../../../src/logs/logs.service";
import type { LogEntryDto } from "../../../src/logs/dto/log-entry.dto";
import { TracesService } from "../../../src/traces/traces.service";
import type { TraceDto } from "../../../src/traces/dto/trace.dto";
import { DemoDataSeeder } from "../../../src/demo/demo-data.seeder";
import type {
  DemoAgentInvocationTreeNode,
  DemoLogsFixtureFile,
  DemoSessionsFixtureFile,
  DemoTracesFixtureFile,
} from "../../../src/demo/demo-data.schema";

type DemoSeedFixture = DemoSessionsFixtureFile &
  DemoTracesFixtureFile &
  DemoLogsFixtureFile;

const DEMO_SEED_FILENAME = "demo-seed.json";

let fixturePath: string;
let demoSeedFixture: DemoSeedFixture;
let expectedSessions: ChatSessionDto[];
let expectedInvocations: Map<string, AgentInvocationSnapshot[]>;
let expectedLogs: LogEntryDto[];
let expectedTraces: TraceDto[];

beforeAll(async () => {
  fixturePath = demoFixturePath(DEMO_SEED_FILENAME);
  demoSeedFixture = await readDemoFixture<DemoSeedFixture>(DEMO_SEED_FILENAME);
  expectedSessions = buildExpectedSessions(demoSeedFixture);
  expectedInvocations = buildExpectedInvocations(demoSeedFixture);
  expectedLogs = buildExpectedLogs(demoSeedFixture);
  expectedTraces = buildExpectedTraces(demoSeedFixture);
});

describe("ApiModule demo data seeding", () => {
  it("loads sessions, logs, and traces from the configured demo fixture", async () => {
    const configStoreFactory = () => createConfigStore(fixturePath);
    const minimalApiModule: DynamicModule = {
      module: class MinimalApiModule {},
      providers: [
        {
          provide: ConfigStore,
          useFactory: configStoreFactory,
        },
        {
          provide: CHAT_SESSIONS_REPOSITORY,
          useClass: InMemoryChatSessionsRepository,
        },
        ChatSessionsService,
        LogsService,
        TracesService,
        {
          provide: DemoDataSeeder,
          useFactory: (
            configStore: ConfigStore,
            chatSessionsService: ChatSessionsService,
            logsService: LogsService,
            tracesService: TracesService,
          ) =>
            new DemoDataSeeder(
              configStore,
              chatSessionsService,
              logsService,
              tracesService,
            ),
          inject: [
            ConfigStore,
            ChatSessionsService,
            LogsService,
            TracesService,
          ],
        },
      ],
      exports: [
        ChatSessionsService,
        LogsService,
        TracesService,
        DemoDataSeeder,
      ],
    };
    vi.spyOn(ApiModule, "forRoot").mockReturnValue(minimalApiModule);

    const repository = new InMemoryChatSessionsRepository();
    const moduleRef = await Test.createTestingModule({
      imports: [ApiModule.forRoot({})],
    })
      .overrideProvider(ConfigStore)
      .useFactory(configStoreFactory)
      .overrideProvider(CHAT_SESSIONS_REPOSITORY)
      .useValue(repository)
      .compile();

    const app = moduleRef.createNestApplication();

    try {
      await app.init();

      const chatSessionsService = app.get(ChatSessionsService);
      const logsService = app.get(LogsService);
      const tracesService = app.get(TracesService);

      const sessions = await chatSessionsService.listSessions();
      expect(sessions).toEqual(expectedSessions);

      for (const session of sessions) {
        const invocations = await chatSessionsService.listAgentInvocations(
          session.id,
        );
        expect(invocations).toEqual(
          expectedInvocations.get(session.id) ?? [],
        );
      }

      const logs = logsService.list();
      expect(logs).toEqual(expectedLogs);

      const traces = tracesService.list();
      expect(traces).toEqual(expectedTraces);
    } finally {
      await app.close();
    }
  }, 30_000);
});

function createConfigStore(seedPath: string): ConfigStore {
  const baseConfig = structuredClone(DEFAULT_CONFIG) as EddieConfig;
  let snapshot: EddieConfig = {
    ...baseConfig,
    api: {
      ...(baseConfig.api ?? {}),
      persistence: { driver: "memory" },
      demoSeeds: { files: [seedPath] },
    },
  };
  const subject = new BehaviorSubject<EddieConfig>(structuredClone(snapshot));

  return {
    getSnapshot: () => structuredClone(snapshot),
    setSnapshot: (config: EddieConfig) => {
      snapshot = structuredClone(config);
      subject.next(structuredClone(snapshot));
    },
    changes$: subject.asObservable(),
  } as unknown as ConfigStore;
}

function buildExpectedSessions(fixture: DemoSeedFixture): ChatSessionDto[] {
  return fixture.sessions
    .map((session) => {
      const createdAt = new Date(session.createdAt).toISOString();
      const updatedAt = calculateUpdatedAt(session.createdAt, session.messages.length);

      return {
        id: session.id,
        title: session.title,
        description: session.description ?? undefined,
        status: "active",
        createdAt,
        updatedAt,
      } satisfies ChatSessionDto;
    })
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
}

function calculateUpdatedAt(createdAt: string, messageCount: number): string {
  if (messageCount === 0) {
    return new Date(createdAt).toISOString();
  }

  const timestamp = Date.parse(createdAt) + (messageCount - 1) * 1_000;
  return new Date(timestamp).toISOString();
}

function buildExpectedInvocations(
  fixture: DemoSeedFixture,
): Map<string, AgentInvocationSnapshot[]> {
  const entries = fixture.sessions.map((session) => {
    if (!session.agentInvocationTree) {
      return [session.id, [] as AgentInvocationSnapshot[]] as const;
    }

    return [
      session.id,
      [buildInvocationSnapshot(session.agentInvocationTree)],
    ] as const;
  });

  return new Map(entries);
}

function buildInvocationSnapshot(
  node: DemoAgentInvocationTreeNode,
): AgentInvocationSnapshot {
  return {
    id: node.id,
    messages: buildInvocationMessages(node),
    children: (node.children ?? []).map((child) =>
      buildInvocationSnapshot(child),
    ),
  } satisfies AgentInvocationSnapshot;
}

function buildInvocationMessages(
  node: DemoAgentInvocationTreeNode,
): AgentInvocationSnapshot["messages"] {
  const messages: AgentInvocationSnapshot["messages"] = [
    { role: "assistant", content: `${node.agent} (${node.status})` },
  ];

  if (node.tool) {
    messages.push({
      role: "tool",
      name: node.tool,
      content: stringifyOutput(node.output),
    });
  } else if (node.output !== undefined) {
    messages.push({
      role: "assistant",
      content: stringifyOutput(node.output),
    });
  }

  return messages;
}

function stringifyOutput(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function buildExpectedLogs(fixture: DemoSeedFixture): LogEntryDto[] {
  return fixture.entries
    .map((entry) => {
      const id = createStableId("log", {
        timestamp: entry.timestamp,
        level: entry.level,
        message: entry.message,
        context: entry.context ?? null,
      });

      return {
        id,
        level: entry.level as LogEntryDto["level"],
        message: entry.message,
        context: entry.context,
        createdAt: new Date(entry.timestamp).toISOString(),
      } satisfies LogEntryDto;
    })
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
}

function buildExpectedTraces(fixture: DemoSeedFixture): TraceDto[] {
  if (fixture.events.length === 0) {
    return [];
  }

  const sortedEvents = fixture.events
    .slice()
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

  const id = createStableId("trace", sortedEvents);
  const createdAt = new Date(sortedEvents[0]?.timestamp ?? Date.now()).toISOString();
  const updatedAt = new Date(
    sortedEvents[sortedEvents.length - 1]?.timestamp ?? Date.now(),
  ).toISOString();
  const durationMs =
    new Date(updatedAt).getTime() - new Date(createdAt).getTime();

  return [
    {
      id,
      sessionId: undefined,
      name: sortedEvents[sortedEvents.length - 1]?.type ?? "demo-trace",
      status: "completed",
      durationMs,
      metadata: {
        events: sortedEvents.map((event) => ({
          id: event.id,
          type: event.type,
          timestamp: event.timestamp,
          payload: event.payload,
        })),
      },
      createdAt,
      updatedAt,
    } satisfies TraceDto,
  ];
}

function createStableId(prefix: string, value: unknown): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(value));
  return `${prefix}-${hash.digest("hex")}`;
}

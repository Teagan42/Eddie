import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConfigStore } from "@eddie/config";

import { DemoDataSeeder } from "../../../src/demo/demo-data.seeder";

const loaderMocks = vi.hoisted(() => ({
  loadDemoSessionsFixture: vi.fn(),
  loadDemoTracesFixture: vi.fn(),
  loadDemoLogsFixture: vi.fn(),
}));

vi.mock("../../../src/demo/demo-data.loader", () => loaderMocks);

const {
  loadDemoSessionsFixture,
  loadDemoTracesFixture,
  loadDemoLogsFixture,
} = loaderMocks;

type ChatSessionsService = import("../../../src/chat-sessions/chat-sessions.service").ChatSessionsService;
type LogsService = import("../../../src/logs/logs.service").LogsService;
type TracesService = import("../../../src/traces/traces.service").TracesService;

interface SeederDependencies {
  configStore: ConfigStore;
  chatSessionsService: ChatSessionsService;
  logsService: LogsService;
  tracesService: TracesService;
  seeder: DemoDataSeeder;
}

interface SeederOverrides {
  chatSessionsService?: Partial<ChatSessionsService>;
  logsService?: Partial<LogsService>;
  tracesService?: Partial<TracesService>;
}

function createSeeder(
  config: unknown = {},
  overrides: SeederOverrides = {}
): SeederDependencies {
  const configStore = {
    getSnapshot: vi.fn().mockReturnValue(config),
  } as unknown as ConfigStore;

  const chatSessionsService = {
    seedSessionSnapshot: vi.fn(),
    listSessions: vi.fn().mockResolvedValue([]),
    ...overrides.chatSessionsService,
  } as unknown as ChatSessionsService;

  const logsService = {
    seedEntry: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    ...overrides.logsService,
  } as unknown as LogsService;

  const tracesService = {
    seedTrace: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    ...overrides.tracesService,
  } as unknown as TracesService;

  const seeder = new DemoDataSeeder(
    configStore,
    chatSessionsService,
    logsService,
    tracesService
  );

  return {
    configStore,
    chatSessionsService,
    logsService,
    tracesService,
    seeder,
  };
}

describe("DemoDataSeeder", () => {
  beforeEach(() => {
    loadDemoSessionsFixture.mockReset();
    loadDemoTracesFixture.mockReset();
    loadDemoLogsFixture.mockReset();
  });

  it("skips seeding when demo seeds config is missing", async () => {
    const { seeder, chatSessionsService, logsService, tracesService } =
      createSeeder({});

    await seeder.onModuleInit();

    expect(loadDemoSessionsFixture).not.toHaveBeenCalled();
    expect(loadDemoTracesFixture).not.toHaveBeenCalled();
    expect(loadDemoLogsFixture).not.toHaveBeenCalled();
    expect(chatSessionsService.seedSessionSnapshot).not.toHaveBeenCalled();
    expect(logsService.seedEntry).not.toHaveBeenCalled();
    expect(tracesService.seedTrace).not.toHaveBeenCalled();
  });

  it("seeds chat sessions, logs, and traces from configured files", async () => {
    const filePath = "/seeds/demo.json";

    loadDemoSessionsFixture.mockResolvedValueOnce({
      sessions: [
        {
          id: "demo-session",
          title: "Demo Session",
          createdAt: "2024-01-01T00:00:00.000Z",
          messages: [
            { id: "msg-1", role: "user", content: "hello" },
            { id: "msg-2", role: "assistant", content: "hi there" },
          ],
          agentInvocationTree: {
            id: "root",
            agent: "demo",
            status: "succeeded",
            output: "All done",
            children: [
              {
                id: "child",
                agent: "worker",
                status: "completed",
                tool: "tool.run",
                output: { result: "ok" },
              },
            ],
          },
        },
      ],
    });

    loadDemoTracesFixture.mockResolvedValueOnce({
      events: [
        {
          id: "evt-1",
          type: "start",
          timestamp: "2024-01-01T00:00:01.000Z",
          payload: { scope: "demo" },
        },
        {
          id: "evt-2",
          type: "finish",
          timestamp: "2024-01-01T00:00:05.000Z",
          payload: { status: "ok" },
        },
      ],
    });

    loadDemoLogsFixture.mockResolvedValueOnce({
      entries: [
        {
          timestamp: "2024-01-01T00:00:02.000Z",
          level: "info",
          message: "seeded",
        },
      ],
    });

    const {
      seeder,
      chatSessionsService,
      logsService,
      tracesService,
    } = createSeeder(
      { api: { demoSeeds: { files: [filePath] } } },
      {}
    );

    await seeder.onModuleInit();

    expect(loadDemoSessionsFixture).toHaveBeenCalledWith(filePath);
    expect(loadDemoTracesFixture).toHaveBeenCalledWith(filePath);
    expect(loadDemoLogsFixture).toHaveBeenCalledWith(filePath);

    expect(chatSessionsService.seedSessionSnapshot).toHaveBeenCalledTimes(1);
    const snapshot =
      chatSessionsService.seedSessionSnapshot.mock.calls[0]?.[0];
    expect(snapshot?.session).toMatchObject({
      id: "demo-session",
      title: "Demo Session",
      status: "active",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    expect(snapshot?.messages).toHaveLength(2);
    expect(snapshot?.messages?.[0]).toMatchObject({
      id: "msg-1",
      sessionId: "demo-session",
      role: "user",
      content: "hello",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    expect(snapshot?.messages?.[1]?.createdAt).toBe(
      "2024-01-01T00:00:01.000Z"
    );
    expect(snapshot?.agentInvocations).toEqual([
      expect.objectContaining({
        id: "root",
        children: [expect.objectContaining({ id: "child" })],
      }),
    ]);

    expect(logsService.seedEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        message: "seeded",
        createdAt: "2024-01-01T00:00:02.000Z",
      })
    );

    expect(tracesService.seedTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAt: "2024-01-01T00:00:01.000Z",
        updatedAt: "2024-01-01T00:00:05.000Z",
        metadata: expect.objectContaining({
          events: [
            expect.objectContaining({ id: "evt-1" }),
            expect.objectContaining({ id: "evt-2" }),
          ],
        }),
      })
    );
  });

  it("skips re-seeding data when matching ids already exist", async () => {
    const filePath = "/seeds/demo.json";

    const sessionsFixture = {
      sessions: [
        {
          id: "demo-session",
          title: "Demo Session",
          createdAt: "2024-01-01T00:00:00.000Z",
          messages: [],
        },
      ],
    };

    const traceEvents = [
      {
        id: "evt-1",
        type: "start",
        timestamp: "2024-01-01T00:00:01.000Z",
        payload: { scope: "demo" },
      },
    ];

    const logEntry = {
      timestamp: "2024-01-01T00:00:02.000Z",
      level: "info",
      message: "seeded",
    };

    loadDemoSessionsFixture.mockResolvedValueOnce(sessionsFixture);
    loadDemoTracesFixture.mockResolvedValueOnce({ events: traceEvents });
    loadDemoLogsFixture.mockResolvedValueOnce({ entries: [logEntry] });

    const logId = `log-${createHash("sha256")
      .update(
        JSON.stringify({
          timestamp: logEntry.timestamp,
          level: logEntry.level,
          message: logEntry.message,
          context: null,
        })
      )
      .digest("hex")}`;

    const traceId = `trace-${createHash("sha256")
      .update(JSON.stringify(traceEvents))
      .digest("hex")}`;

    const {
      seeder,
      chatSessionsService,
      logsService,
      tracesService,
    } = createSeeder(
      { api: { demoSeeds: { files: [filePath] } } },
      {
        chatSessionsService: {
          listSessions: vi.fn().mockResolvedValue([
            { id: "demo-session" } as { id: string },
          ]),
          seedSessionSnapshot: vi.fn(),
        },
        logsService: {
          list: vi.fn().mockReturnValue([
            { id: logId, level: "info", message: "seeded", createdAt: logEntry.timestamp },
          ]),
          seedEntry: vi.fn(),
        },
        tracesService: {
          list: vi.fn().mockReturnValue([
            { id: traceId, name: "trace", status: "completed", createdAt: traceEvents[0].timestamp, updatedAt: traceEvents[0].timestamp },
          ]),
          seedTrace: vi.fn(),
        },
      }
    );

    await seeder.onModuleInit();

    expect(loadDemoSessionsFixture).toHaveBeenCalledWith(filePath);
    expect(chatSessionsService.seedSessionSnapshot).not.toHaveBeenCalled();
    expect(logsService.seedEntry).not.toHaveBeenCalled();
    expect(tracesService.seedTrace).not.toHaveBeenCalled();
  });
});

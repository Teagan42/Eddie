import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Controller, Get, INestApplication, Inject, Param } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ConfigStore } from "@eddie/config";
import { LoggerService } from "@eddie/io";
import {
  CHAT_SESSIONS_REPOSITORY,
  InMemoryChatSessionsRepository,
  type ChatSessionsRepository,
} from "../../../src/chat-sessions/chat-sessions.repository";
import { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import { LogsService } from "../../../src/logs/logs.service";
import { TracesService } from "../../../src/traces/traces.service";
import { DemoFixturesLoader } from "../../../src/demo/demo-fixtures-loader.service";
import {
  readDemoFixtures,
  type DemoFixtures,
} from "../../../src/demo/demo-fixtures";
import {
  mergeRuntimeConfig,
  runtimeDefaults,
} from "../../../src/runtime-config/runtime.config";
import type { RuntimeConfigDto } from "../../../src/runtime-config/dto/runtime-config.dto";
import type { RuntimeConfigService } from "../../../src/runtime-config/runtime-config.service";

const FIXTURE_PATH = fileURLToPath(
  new URL("../../../demo/fixtures/overview-demo.json", import.meta.url)
);

vi.setConfig({ hookTimeout: 60_000 });

class TestRuntimeConfigService
  implements Pick<RuntimeConfigService, "get" | "seed">
{
  private snapshot: RuntimeConfigDto = mergeRuntimeConfig(runtimeDefaults, {});

  get(): RuntimeConfigDto {
    return this.snapshot;
  }

  seed(config: RuntimeConfigDto): void {
    this.snapshot = mergeRuntimeConfig(runtimeDefaults, config);
  }
}

function createLoggerStub(): LoggerService {
  const noop = () => undefined;
  const logger = {
    configure: noop,
    warn: noop,
    error: noop,
    log: noop,
    debug: noop,
    child: () => logger,
    getLogger: () => logger,
    info: noop,
  } satisfies LoggerService;
  return logger;
}

@Controller("chat-sessions")
class DemoChatSessionsController {
  constructor(
    @Inject(ChatSessionsService)
    private readonly chatSessions: ChatSessionsService
  ) {}

  @Get()
  async list() {
    const sessions = await this.chatSessions.listSessions();
    return { data: sessions };
  }

  @Get(":id/messages")
  async messages(@Param("id") id: string) {
    const messages = await this.chatSessions.listMessages(id);
    return { data: messages };
  }
}

@Controller("traces")
class DemoTracesController {
  constructor(
    @Inject(TracesService)
    private readonly traces: TracesService
  ) {}

  @Get()
  list() {
    return { data: this.traces.list() };
  }
}

@Controller("logs")
class DemoLogsController {
  constructor(
    @Inject(LogsService)
    private readonly logs: LogsService
  ) {}

  @Get()
  list() {
    return { data: this.logs.list() };
  }
}

@Controller("config")
class DemoRuntimeConfigController {
  constructor(
    @Inject(TestRuntimeConfigService)
    private readonly runtime: TestRuntimeConfigService
  ) {}

  @Get()
  get() {
    return this.runtime.get();
  }
}

function createDemoServices() {
  const chatSessionsRepository = new InMemoryChatSessionsRepository();
  const chatSessionsService = new ChatSessionsService(
    chatSessionsRepository as ChatSessionsRepository
  );
  const tracesService = new TracesService();
  const logsService = new LogsService();
  const runtimeConfigService = new TestRuntimeConfigService();
  const loggerService = createLoggerStub();

  return {
    chatSessionsRepository,
    chatSessionsService,
    tracesService,
    logsService,
    runtimeConfigService,
    loggerService,
  } as const;
}

describe("demo fixtures integration", () => {
  let app: INestApplication;
  let fixture: DemoFixtures;

  beforeAll(async () => {
    fixture = await readDemoFixtures(FIXTURE_PATH);

    const configStore = new ConfigStore();
    const snapshot = configStore.getSnapshot();
    snapshot.projectDir = path.resolve(__dirname, "../../../../..");
    snapshot.api ??= {};
    snapshot.api.persistence = { driver: "memory" };
    snapshot.api.demo = {
      enabled: true,
      fixtures: { path: "apps/api/demo/fixtures/overview-demo.json" },
    };
    configStore.setSnapshot(snapshot);

    const {
      chatSessionsRepository,
      chatSessionsService,
      tracesService,
      logsService,
      runtimeConfigService,
      loggerService,
    } = createDemoServices();

    const loader = new DemoFixturesLoader(
      configStore,
      chatSessionsRepository,
      tracesService,
      logsService,
      runtimeConfigService as unknown as RuntimeConfigService,
      loggerService
    );

    await loader.onModuleInit();

    const moduleRef = await Test.createTestingModule({
      controllers: [
        DemoChatSessionsController,
        DemoTracesController,
        DemoLogsController,
        DemoRuntimeConfigController,
      ],
      providers: [
        { provide: ChatSessionsService, useValue: chatSessionsService },
        { provide: TracesService, useValue: tracesService },
        { provide: LogsService, useValue: logsService },
        {
          provide: TestRuntimeConfigService,
          useValue: runtimeConfigService,
        },
        {
          provide: LoggerService,
          useValue: loggerService,
        },
        {
          provide: CHAT_SESSIONS_REPOSITORY,
          useValue: chatSessionsRepository,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("hydrates chat sessions and messages from the demo fixtures", async () => {
    const [firstSession] = fixture.chatSessions;
    expect(firstSession).toBeDefined();

    const sessionsResponse = await request(app.getHttpServer())
      .get("/chat-sessions")
      .expect(200);

    expect(sessionsResponse.body.data).toEqual(
      expect.arrayContaining(
        fixture.chatSessions.map(({ session }) =>
          expect.objectContaining({
            id: session.id,
            title: session.title,
            description: session.description,
            status: session.status,
          })
        )
      )
    );

    const sessionMessagesResponse = await request(app.getHttpServer())
      .get(`/chat-sessions/${firstSession.session.id}/messages`)
      .expect(200);

    expect(sessionMessagesResponse.body.data).toEqual(
      expect.arrayContaining(
        firstSession.messages.map((message) =>
          expect.objectContaining({
            id: message.id,
            sessionId: message.sessionId,
            role: message.role,
            content: message.content,
          })
        )
      )
    );
  });

  it("exposes trace snapshots from the fixture dataset", async () => {
    const response = await request(app.getHttpServer())
      .get("/traces")
      .expect(200);

    expect(response.body.data).toEqual(
      expect.arrayContaining(
        fixture.traces.map((trace) =>
          expect.objectContaining({
            id: trace.id,
            name: trace.name,
            status: trace.status,
            durationMs: trace.durationMs ?? null,
            sessionId: trace.sessionId ?? null,
          })
        )
      )
    );
  });

  it("returns structured logs from the fixtures", async () => {
    const response = await request(app.getHttpServer())
      .get("/logs")
      .expect(200);

    expect(response.body.data).toEqual(
      expect.arrayContaining(
        fixture.logs.map((log) =>
          expect.objectContaining({
            id: log.id,
            level: log.level,
            message: log.message,
            context: log.context ?? null,
          })
        )
      )
    );
  });

  it("provides runtime config from the fixtures", async () => {
    const response = await request(app.getHttpServer())
      .get("/config")
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        apiUrl: fixture.runtime.config.apiUrl,
        websocketUrl: fixture.runtime.config.websocketUrl,
        features: fixture.runtime.config.features,
        theme: fixture.runtime.config.theme,
      })
    );
  });
});

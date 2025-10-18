import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NotFoundException } from "@nestjs/common";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import knex, { type Knex } from "knex";
import {
  ConfigModule,
  ConfigService,
  ConfigStore,
  DEFAULT_CONFIG,
} from "@eddie/config";
import type { ApiPersistenceConfig } from "@eddie/config";

import { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import { CHAT_SESSIONS_REPOSITORY_PROVIDER } from "../../../src/chat-sessions/chat-sessions.module";
import { ChatMessageRole } from "../../../src/chat-sessions/dto/create-chat-message.dto";
import {
  createKnexConfig,
  KNEX_INSTANCE,
} from "../../../src/persistence/knex.provider";
import { KnexChatSessionsRepository } from "../../../src/chat-sessions/chat-sessions.repository";

type SqlDriver = "postgres" | "mysql" | "mariadb";

const createTempFilename = (): string => {
  const directory = mkdtempSync(path.join(tmpdir(), "eddie-chat-sessions-"));
  return path.join(directory, "chat.sqlite");
};

const shouldTestDriver = (driver: SqlDriver): boolean => {
  const env = process.env.E2E_DB;
  if (!env) {
    return false;
  }
  const requested = env
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return requested.includes(driver) || requested.includes("all");
};

const createFakeKnex = (config: Knex.Config): Knex =>
  ({
    schema: {
      hasTable: vi.fn().mockResolvedValue(true),
      createTable: vi.fn(),
    },
    client: { config },
    destroy: vi.fn().mockResolvedValue(undefined),
  } as unknown as Knex);

const defaultCreateKnexInstance = (
  persistence: ApiPersistenceConfig,
  config: Knex.Config
): Knex | undefined => {
  if (persistence.driver === "sqlite") {
    const instance = knex(config);
    void instance.raw?.("PRAGMA foreign_keys = ON");
    return instance;
  }
  return createFakeKnex(config);
};

type BuildModuleOptions = {
  createKnex?: (
    persistence: ApiPersistenceConfig,
    knexConfig: Knex.Config
  ) => Knex | undefined;
  onConfig?: (config: Knex.Config) => void;
};

describe("ChatSessionsRepository persistence", () => {
  let filename: string;
  const createdDirs: string[] = [];

  beforeEach(() => {
    filename = createTempFilename();
    createdDirs.push(path.dirname(filename));
  });

  const sqlitePersistence = (): ApiPersistenceConfig => ({
    driver: "sqlite",
    sqlite: { filename },
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    for (const dir of createdDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failures in CI environments
      }
    }
  });

  const buildTestingModule = async (
    persistence: ApiPersistenceConfig,
    options: BuildModuleOptions = {}
  ) => {
    const config = structuredClone(DEFAULT_CONFIG);
    config.api = {
      ...(config.api ?? {}),
      persistence,
    };

    const load = vi.fn().mockResolvedValue(config);
    const getSnapshot = vi.fn().mockReturnValue(config);

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule,
      ],
      providers: [
        {
          provide: KNEX_INSTANCE,
          useFactory: () => {
            const knexConfig = createKnexConfig(persistence);
            options.onConfig?.(knexConfig);
            const createInstance = options.createKnex ?? defaultCreateKnexInstance;
            return createInstance(persistence, knexConfig);
          },
        },
        CHAT_SESSIONS_REPOSITORY_PROVIDER,
        ChatSessionsService,
      ],
    })
      .overrideProvider(ConfigStore)
      .useValue({ getSnapshot })
      .overrideProvider(ConfigService)
      .useValue({ load })
      .compile();

    const database = moduleRef.get<Knex | undefined>(KNEX_INSTANCE, {
      strict: false,
    });

    return { moduleRef, database };
  };

  it("persists messages to disk across service lifecycles", async () => {
    const persistence = sqlitePersistence();

    const first = await buildTestingModule(persistence);
    const firstService = first.moduleRef.get(ChatSessionsService);

    const session = await firstService.createSession({ title: "Persisted" });
    await firstService.addMessage(session.id, {
      role: ChatMessageRole.User,
      content: "Hello",
    });

    await first.moduleRef.close();
    await first.database?.destroy();

    const second = await buildTestingModule(persistence);
    const secondService = second.moduleRef.get(ChatSessionsService);

    const messages = await secondService.listMessages(session.id);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe("Hello");

    await second.moduleRef.close();
    await second.database?.destroy();
  });

  it("persists session renames across service lifecycles", async () => {
    const persistence = sqlitePersistence();

    const first = await buildTestingModule(persistence);
    const firstService = first.moduleRef.get(ChatSessionsService);

    const session = await firstService.createSession({ title: "Original" });
    await firstService.renameSession(session.id, { title: "Updated" });

    await first.moduleRef.close();
    await first.database?.destroy();

    const second = await buildTestingModule(persistence);
    const secondService = second.moduleRef.get(ChatSessionsService);
    const restored = await secondService.getSession(session.id);

    expect(restored.title).toBe("Updated");

    await second.moduleRef.close();
    await second.database?.destroy();
  });

  it("cascades deletes to messages and agent invocations", async () => {
    const persistence = sqlitePersistence();

    const { moduleRef, database } = await buildTestingModule(persistence);
    const service = moduleRef.get(ChatSessionsService);

    const session = await service.createSession({ title: "Disposable" });
    await service.addMessage(session.id, {
      role: ChatMessageRole.User,
      content: "hello",
    });

    await service.saveAgentInvocations(session.id, [
      {
        id: "agent",
        messages: [
          {
            role: ChatMessageRole.Assistant,
            content: "thinking",
          },
        ],
        children: [],
      },
    ]);

    await service.deleteSession(session.id);

    await expect(service.getSession(session.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.listMessages(session.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.listAgentInvocations(session.id)).resolves.toEqual([]);

    const remainingMessages = await database?.("chat_messages").where({
      session_id: session.id,
    });
    expect(remainingMessages ?? []).toHaveLength(0);

    const remainingInvocations = await database?.("agent_invocations").where({
      session_id: session.id,
    });
    expect(remainingInvocations ?? []).toHaveLength(0);

    await moduleRef.close();
    await database?.destroy();
  });

  const buildSqlPersistence = (
    driver: SqlDriver,
    overrides: Partial<ApiPersistenceConfig[typeof driver]> = {}
  ): ApiPersistenceConfig => {
    const base = {
      connection: {
        host: "localhost",
        port: driver === "postgres" ? 5432 : 3306,
        database: "eddie",
        user: driver === "postgres" ? "postgres" : "root",
        password: "password",
      },
      pool: { min: 0, max: 4 },
      ...overrides,
    } satisfies ApiPersistenceConfig[typeof driver];

    return {
      driver,
      [driver]: base,
    } as ApiPersistenceConfig;
  };

  const runSqlTest = (driver: SqlDriver) =>
    shouldTestDriver(driver) ? it : it.skip;

  runSqlTest("postgres")(
    "configures the postgres driver via the knex provider",
    async () => {
      const persistence = buildSqlPersistence("postgres");
      const captured: Knex.Config[] = [];

      const { moduleRef, database } = await buildTestingModule(persistence, {
        onConfig: (config) => captured.push(config),
      });

      const repository = moduleRef.get(
        CHAT_SESSIONS_REPOSITORY_PROVIDER.provide
      );

      expect(repository).toBeInstanceOf(KnexChatSessionsRepository);
      expect(database?.client.config).toMatchObject({ client: "pg" });
      expect(captured.at(-1)).toMatchObject({
        client: "pg",
        connection: expect.objectContaining({
          host: "localhost",
          port: 5432,
          database: "eddie",
          user: "postgres",
          password: "password",
        }),
        pool: { min: 0, max: 4 },
      });

      await moduleRef.close();
    }
  );

  runSqlTest("mysql")(
    "configures the mysql driver via the knex provider",
    async () => {
      const persistence = buildSqlPersistence("mysql", {
        ssl: false,
      });
      const captured: Knex.Config[] = [];

      const { moduleRef, database } = await buildTestingModule(persistence, {
        onConfig: (config) => captured.push(config),
      });

      const repository = moduleRef.get(
        CHAT_SESSIONS_REPOSITORY_PROVIDER.provide
      );

      expect(repository).toBeInstanceOf(KnexChatSessionsRepository);
      expect(database?.client.config).toMatchObject({ client: "mysql2" });
      expect(captured.at(-1)).toMatchObject({
        client: "mysql2",
        connection: expect.objectContaining({
          host: "localhost",
          port: 3306,
          database: "eddie",
          user: "root",
          password: "password",
          ssl: false,
        }),
        pool: { min: 0, max: 4 },
      });

      await moduleRef.close();
    }
  );

  runSqlTest("mariadb")(
    "configures the mariadb driver via the knex provider",
    async () => {
      const persistence = buildSqlPersistence("mariadb", {
        url: "mysql://root:password@localhost:3306/eddie",
      });
      const captured: Knex.Config[] = [];

      const { moduleRef, database } = await buildTestingModule(persistence, {
        onConfig: (config) => captured.push(config),
      });

      const repository = moduleRef.get(
        CHAT_SESSIONS_REPOSITORY_PROVIDER.provide
      );

      expect(repository).toBeInstanceOf(KnexChatSessionsRepository);
      expect(database?.client.config).toMatchObject({ client: "mysql2" });
      expect(captured.at(-1)).toMatchObject({
        client: "mysql2",
        connection: "mysql://root:password@localhost:3306/eddie",
        pool: { min: 0, max: 4 },
      });

      await moduleRef.close();
    }
  );
});

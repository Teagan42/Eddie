import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Test } from "@nestjs/testing";
import knex, { type Knex } from "knex";
import {
  ConfigService,
  ConfigStore,
  DEFAULT_CONFIG,
} from "@eddie/config";
import type { ApiPersistenceConfig } from "@eddie/config";

import { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import { CHAT_SESSIONS_REPOSITORY_PROVIDER } from "../../../src/chat-sessions/chat-sessions.module";
import { ChatMessageRole } from "../../../src/chat-sessions/dto/create-chat-message.dto";
import {
  KNEX_INSTANCE,
  createKnexConfig,
} from "../../../src/persistence/knex.provider";
import { KnexChatSessionsRepository } from "../../../src/chat-sessions/chat-sessions.repository";

type SqlDriver = "postgres" | "mysql" | "mariadb";

const SQL_DRIVERS: SqlDriver[] = ["postgres", "mysql", "mariadb"];

const createTempFilename = (): string => {
  const directory = mkdtempSync(path.join(tmpdir(), "eddie-chat-sessions-"));
  return path.join(directory, "chat.sqlite");
};

describe("ChatSessionsRepository persistence", () => {
  let filename: string;
  const createdDirs: string[] = [];

  beforeEach(() => {
    filename = createTempFilename();
    createdDirs.push(path.dirname(filename));
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
    options?: {
      knexFactory?: (config: Knex.Config) => Knex;
      knexInstance?: Knex;
    }
  ) => {
    const config = structuredClone(DEFAULT_CONFIG);
    config.api = {
      ...(config.api ?? {}),
      persistence,
    };

    const load = vi.fn().mockResolvedValue(config);
    const getSnapshot = vi.fn().mockReturnValue(config);

    const providers = [
      { provide: ConfigService, useValue: { load } },
      { provide: ConfigStore, useValue: { getSnapshot } },
      CHAT_SESSIONS_REPOSITORY_PROVIDER,
      ChatSessionsService,
    ];

    if (options?.knexInstance) {
      providers.push({ provide: KNEX_INSTANCE, useValue: options.knexInstance });
    } else {
      providers.push({
        provide: KNEX_INSTANCE,
        useFactory: () => {
          const knexConfig = createKnexConfig(persistence);
          const factory = options?.knexFactory ?? ((config: Knex.Config) => knex(config));
          return factory(knexConfig);
        },
      });
    }

    const moduleRef = await Test.createTestingModule({ providers }).compile();

    return { moduleRef };
  };

  it("persists messages to disk across service lifecycles when using sqlite", async () => {
    const sqliteConfig: ApiPersistenceConfig = {
      driver: "sqlite",
      sqlite: { filename },
    };

    const firstDatabase = knex(createKnexConfig(sqliteConfig));
    const firstModule = await buildTestingModule(sqliteConfig, {
      knexInstance: firstDatabase,
    });
    const firstService = firstModule.moduleRef.get(ChatSessionsService);

    const session = await firstService.createSession({ title: "Persisted" });
    await firstService.addMessage(session.id, {
      role: ChatMessageRole.User,
      content: "Hello",
    });

    await firstModule.moduleRef.close();
    await firstDatabase.destroy();

    const secondDatabase = knex(createKnexConfig(sqliteConfig));
    const secondModule = await buildTestingModule(sqliteConfig, {
      knexInstance: secondDatabase,
    });
    const secondService = secondModule.moduleRef.get(ChatSessionsService);

    const messages = await secondService.listMessages(session.id);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe("Hello");

    await secondModule.moduleRef.close();
    await secondDatabase.destroy();
  });

  for (const driver of SQL_DRIVERS) {
    const run =
      typeof process.env.E2E_DB === "undefined" || process.env.E2E_DB === driver
        ? it
        : it.skip;

    run(`configures knex when using the ${driver} driver`, async () => {
      const destroy = vi.fn();
      const hasTable = vi.fn().mockResolvedValue(true);
      const createTable = vi.fn();
      const knexFactory = vi.fn<(config: Knex.Config) => Knex>((config) =>
        ({
          client: { config },
          schema: { hasTable, createTable },
          destroy,
        }) as unknown as Knex
      );

      const persistence: ApiPersistenceConfig = {
        driver,
        [driver]: {
          url: `${driver}://example`,
          ssl: driver === "postgres",
          connection: {},
        },
      } as ApiPersistenceConfig;

      const module = await buildTestingModule(persistence, { knexFactory });

      expect(knexFactory).toHaveBeenCalledTimes(1);
      const configArg = knexFactory.mock.calls[0]?.[0];
      expect(configArg?.client).toBe(driver === "postgres" ? "pg" : "mysql2");
      expect(configArg?.connection).toMatchObject({
        connectionString: `${driver}://example`,
        ...(driver === "postgres" ? { ssl: true } : {}),
      });

      const repository = module.moduleRef.get(
        CHAT_SESSIONS_REPOSITORY_PROVIDER.provide
      );
      expect(repository).toBeInstanceOf(KnexChatSessionsRepository);

      await module.moduleRef.close();
      expect(destroy).not.toHaveBeenCalled();
    });
  }
});

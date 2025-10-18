import { afterEach, describe, expect, it, vi } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import type { EddieConfig } from "@eddie/config";
import { ConfigStore, DEFAULT_CONFIG } from "@eddie/config";

import { DatabaseModule } from "../../../src/persistence/database.module";
import {
  API_PERSISTENCE_SKIP_MIGRATIONS_ENV,
  DatabaseService,
} from "../../../src/persistence/database.service";

describe("DatabaseModule", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a postgres knex instance from the config snapshot", async () => {
    const originalSkip = process.env[API_PERSISTENCE_SKIP_MIGRATIONS_ENV];
    process.env[API_PERSISTENCE_SKIP_MIGRATIONS_ENV] = "true";

    const config: EddieConfig = structuredClone(DEFAULT_CONFIG);
    config.api = {
      ...(config.api ?? {}),
      persistence: {
        driver: "postgres",
        postgres: {
          connection: {
            host: "localhost",
            port: 5432,
            database: "eddie",
            user: "postgres",
            password: "password",
          },
        },
      },
    };

    const getSnapshot = vi.fn().mockReturnValue(config);
    const moduleRef = await createDatabaseTestingModule(getSnapshot);

    try {
      await moduleRef.init();

      const database = resolveDatabaseService(moduleRef);
      const knex = database.getClient();

      expect(getSnapshot).toHaveBeenCalledTimes(1);
      expect(knex.client.config.client).toBe("pg");
      expect(knex.client.config.connection).toMatchObject({
        host: "localhost",
        port: 5432,
        database: "eddie",
        user: "postgres",
        password: "password",
      });
    } finally {
      await moduleRef.close();
      process.env[API_PERSISTENCE_SKIP_MIGRATIONS_ENV] = originalSkip;
    }
  });

  it("resolves the database service when module selection fails", async () => {
    const config: EddieConfig = structuredClone(DEFAULT_CONFIG);
    const moduleRef = await createDatabaseTestingModule(() => config);

    let selectSpy: ReturnType<typeof vi.spyOn> | undefined;

    try {
      await moduleRef.init();

      selectSpy = vi
        .spyOn(moduleRef, "select")
        .mockImplementation(() => {
          throw new Error("module context unavailable");
        });

      const database = resolveDatabaseService(moduleRef);

      expect(selectSpy).toHaveBeenCalledWith(DatabaseModule);
      expect(database).toBeInstanceOf(DatabaseService);
    } finally {
      selectSpy?.mockRestore();
      await moduleRef.close();
    }
  });

  it("does not attempt to create a knex client when using the memory driver", async () => {
    const config: EddieConfig = structuredClone(DEFAULT_CONFIG);
    config.api = {
      ...(config.api ?? {}),
      persistence: {
        driver: "memory",
      },
    };

    const getSnapshot = vi.fn().mockReturnValue(config);

    await expect(
      createDatabaseTestingModule(getSnapshot)
    ).resolves.not.toThrow();
  });
});

async function createDatabaseTestingModule(
  getSnapshot: () => EddieConfig
): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [DatabaseModule],
  })
    .overrideProvider(ConfigStore)
    .useValue({ getSnapshot })
    .compile();
}

function resolveDatabaseService(moduleRef: TestingModule): DatabaseService {
  try {
    return moduleRef
      .select(DatabaseModule)
      .get(DatabaseService, { strict: false });
  } catch (selectError) {
    try {
      return moduleRef.get(DatabaseService, { strict: false });
    } catch {
      throw selectError;
    }
  }
}

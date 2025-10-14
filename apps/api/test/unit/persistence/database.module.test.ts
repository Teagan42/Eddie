import { afterEach, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { EddieConfig } from "@eddie/config";
import { ConfigStore, DEFAULT_CONFIG } from "@eddie/config";
import type { Knex } from "knex";

import { DatabaseModule } from "../../../src/persistence/database.module";
import { DatabaseService } from "../../../src/persistence/database.service";

describe("DatabaseModule", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a postgres knex instance from the config snapshot", async () => {
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
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
    })
      .overrideProvider(ConfigStore)
      .useValue({ getSnapshot })
      .compile();

    const database = moduleRef.get(DatabaseService);
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

    await moduleRef.close();
  });
});

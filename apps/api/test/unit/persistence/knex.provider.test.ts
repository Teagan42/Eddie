import { describe, expect, it } from "vitest";
import type { ApiPersistenceConfig } from "@eddie/config";

import { createKnexConfig } from "../../../src/persistence/knex.provider";

describe("createKnexConfig", () => {
  it("returns a sqlite configuration with the provided filename", () => {
    const config: ApiPersistenceConfig = {
      driver: "sqlite",
      sqlite: { filename: "./test.sqlite" },
    };

    const knexConfig = createKnexConfig(config);

    expect(knexConfig).toEqual(
      expect.objectContaining({
        client: "better-sqlite3",
        connection: { filename: "./test.sqlite" },
        useNullAsDefault: true,
      })
    );
  });

  it("merges sql connection objects and preserves additional options", () => {
    const config: ApiPersistenceConfig = {
      driver: "mysql",
      mysql: {
        connection: {
          host: "localhost",
          port: 3306,
          database: "eddie",
          user: "root",
          password: "password",
        },
        ssl: false,
        pool: { min: 0, max: 4 },
      },
    };

    const knexConfig = createKnexConfig(config);

    expect(knexConfig).toEqual(
      expect.objectContaining({
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
      })
    );
  });

  it("uses connection urls for sql drivers and keeps custom properties", () => {
    const config: ApiPersistenceConfig = {
      driver: "postgres",
      postgres: {
        connection: {
          host: "irrelevant",
          port: 5432,
          database: "unused",
          user: "ignored",
          password: "ignored",
        },
        url: "postgres://postgres:password@localhost:5432/eddie",
        searchPath: ["public"],
      },
    };

    const knexConfig = createKnexConfig(config);

    expect(knexConfig).toEqual(
      expect.objectContaining({
        client: "pg",
        connection: "postgres://postgres:password@localhost:5432/eddie",
        searchPath: ["public"],
      })
    );
  });
});

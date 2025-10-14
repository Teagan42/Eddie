import { describe, expect, it } from "vitest";

import { createKnexConfig } from "../../../src/persistence/knex.provider";

describe("createKnexConfig", () => {
  it("creates a sql client config with a connection string when url is provided", () => {
    const config = createKnexConfig({
      driver: "postgres",
      postgres: {
        url: "postgres://example",
        connection: {},
      },
    });

    expect(config).toEqual({
      client: "pg",
      connection: { connectionString: "postgres://example" },
    });
  });

  it("preserves ssl options when using a url-based connection", () => {
    const config = createKnexConfig({
      driver: "postgres",
      postgres: {
        url: "postgres://secure",
        ssl: true,
        connection: {},
      },
    });

    expect(config).toEqual({
      client: "pg",
      connection: { connectionString: "postgres://secure", ssl: true },
    });
  });
});

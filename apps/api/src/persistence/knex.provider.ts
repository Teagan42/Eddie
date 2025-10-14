import type { Provider } from "@nestjs/common";
import knex, { type Knex } from "knex";
import {
  ConfigStore,
  type ApiPersistenceConfig,
  type ApiPersistenceSqlConfig,
} from "@eddie/config";

export const KNEX_INSTANCE = "KNEX_INSTANCE" as const;

export const KNEX_PROVIDER: Provider = {
  provide: KNEX_INSTANCE,
  useFactory: (configStore: ConfigStore) => {
    const config = configStore.getSnapshot();
    const persistence = config.api?.persistence;

    if (!persistence) {
      throw new Error("api.persistence must be configured for SQL persistence.");
    }

    const knexConfig = createKnexConfig(persistence);
    return knex(knexConfig);
  },
  inject: [ ConfigStore ],
};

export function createKnexConfig(persistence: ApiPersistenceConfig): Knex.Config {
  switch (persistence.driver) {
    case "sqlite": {
      const filename = persistence.sqlite?.filename ?? "data/api.sqlite";
      return {
        client: "better-sqlite3",
        connection: { filename },
        useNullAsDefault: true,
      } satisfies Knex.Config;
    }
    case "postgres":
    case "mysql":
    case "mariadb": {
      return createSqlKnexConfig(persistence);
    }
    case "memory":
      throw new Error(
        'Cannot create a SQL persistence client when "api.persistence.driver" is set to "memory".'
      );
    default: {
      const driver = (persistence as { driver: string }).driver;
      throw new Error(
        `Unsupported SQL persistence driver "${driver}". Supported drivers: sqlite, postgres, mysql, mariadb.`
      );
    }
  }
}

type SqlConfigRecord = ApiPersistenceSqlConfig & {
  connection: Record<string, unknown>;
};

function buildSqlConnection(
  config: ApiPersistenceSqlConfig
): string | Record<string, unknown> {
  if (typeof config.url === "string") {
    return config.url;
  }

  const connection: SqlConfigRecord["connection"] = {
    ...config.connection,
  };

  if (typeof config.ssl !== "undefined") {
    connection.ssl = config.ssl;
  }

  return connection;
}

type SqlDriver = "postgres" | "mysql" | "mariadb";

const SQL_CLIENTS: Record<SqlDriver, Knex.ClientName> = {
  postgres: "pg",
  mysql: "mysql2",
  mariadb: "mysql2",
};

function createSqlKnexConfig(
  persistence:
    | Extract<ApiPersistenceConfig, { driver: "postgres" }>
    | Extract<ApiPersistenceConfig, { driver: "mysql" }>
    | Extract<ApiPersistenceConfig, { driver: "mariadb" }>
): Knex.Config {
  const driver = persistence.driver as SqlDriver;
  const driverConfig = (persistence as Record<string, ApiPersistenceSqlConfig>)[driver];
  const connection = buildSqlConnection(driverConfig);

  return {
    client: SQL_CLIENTS[driver],
    connection,
  } satisfies Knex.Config;
}

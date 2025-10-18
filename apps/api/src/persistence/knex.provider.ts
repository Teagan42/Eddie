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

    if (!persistence || persistence.driver === "memory") {
      return undefined;
    }

    const knexConfig = createKnexConfig(persistence);
    const instance = knex(knexConfig);

    if (persistence.driver === "sqlite") {
      enableSqliteForeignKeys(instance);
    }

    return instance;
  },
  inject: [ ConfigStore ],
};

export const enableSqliteForeignKeys = (instance: Knex | undefined): void => {
  if (!instance || typeof instance.raw !== "function") {
    return;
  }

  void instance.raw("PRAGMA foreign_keys = ON");
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

function buildSqlConnection(
  config: ApiPersistenceSqlConfig
): string | Record<string, unknown> {
  if (typeof config.url === "string") {
    return config.url;
  }

  const connection: Record<string, unknown> = {
    ...config.connection,
  };

  if (typeof config.ssl !== "undefined") {
    connection.ssl = config.ssl;
  }

  return connection;
}

type SqlDriver = "postgres" | "mysql" | "mariadb";

const SQL_CLIENTS: Record<SqlDriver, Knex.Config["client"]> = {
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
  const driverConfig = getSqlDriverConfig(persistence);
  const {
    connection: connectionIgnored,
    url: urlIgnored,
    ssl: sslIgnored,
    ...rest
  } = driverConfig;
  void connectionIgnored;
  void urlIgnored;
  void sslIgnored;
  const connection = buildSqlConnection(driverConfig);

  return {
    client: SQL_CLIENTS[driver],
    connection,
    ...rest,
  } satisfies Knex.Config;
}

function getSqlDriverConfig(
  persistence:
    | Extract<ApiPersistenceConfig, { driver: "postgres" }>
    | Extract<ApiPersistenceConfig, { driver: "mysql" }>
    | Extract<ApiPersistenceConfig, { driver: "mariadb" }>
): ApiPersistenceSqlConfig {
  if (persistence.driver === "postgres") {
    return persistence.postgres;
  }

  if (persistence.driver === "mysql") {
    return persistence.mysql;
  }

  return persistence.mariadb;
}

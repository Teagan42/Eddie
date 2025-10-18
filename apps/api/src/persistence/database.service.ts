import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  Inject,
  Injectable,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { Knex } from "knex";

import { ConfigStore, type ApiPersistenceConfig } from "@eddie/config";

import { KNEX_INSTANCE } from "./knex.provider";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly migrationsConfig: Knex.MigratorConfig = {
    directory: path.join(process.cwd(), "apps", "api", "migrations"),
    loadExtensions: [".ts", ".js"],
    tableName: "knex_migrations",
  } satisfies Knex.MigratorConfig;

  constructor(
    @Optional()
    @Inject(KNEX_INSTANCE)
    private readonly knex: Knex | undefined,
    @Inject(ConfigStore)
    private readonly configStore: ConfigStore
  ) {}

  getClient(): Knex {
    const knex = this.knex;
    if (typeof knex === "undefined") {
      throw new Error("SQL persistence is not configured for the database module.");
    }
    return knex;
  }

  async onModuleInit(): Promise<void> {
    const knex = this.knex;
    if (typeof knex === "undefined") {
      return;
    }
    if (!this.shouldRunMigrations()) {
      return;
    }

    await this.ensureMigrationsDirectory();
    await knex.migrate.latest(this.migrationsConfig);
  }

  async onModuleDestroy(): Promise<void> {
    const knex = this.knex;
    if (typeof knex === "undefined") {
      return;
    }
    await knex.destroy();
  }

  private async ensureMigrationsDirectory(): Promise<void> {
    const { directory } = this.migrationsConfig;
    if (!directory) {
      return;
    }

    const ensureDirectory = async (dir: string): Promise<void> => {
      await mkdir(dir, { recursive: true });
    };

    if (Array.isArray(directory)) {
      await Promise.all(directory.map((dir) => ensureDirectory(dir)));
      return;
    }

    if (typeof directory === "string") {
      await ensureDirectory(directory);
    }
  }

  private shouldRunMigrations(): boolean {
    const knex = this.knex;
    if (typeof knex === "undefined") {
      return false;
    }

    const persistence = this.configStore.getSnapshot().api?.persistence;
    if (!persistence) {
      return false;
    }

    if (persistence.driver === "memory") {
      return false;
    }

    const runOnBootstrap = this.getRunOnBootstrapFlag(persistence);
    if (typeof runOnBootstrap === "boolean") {
      return runOnBootstrap;
    }

    return true;
  }

  private getRunOnBootstrapFlag(persistence: ApiPersistenceConfig): boolean | undefined {
    const driverConfig = this.getDriverPersistenceConfig(persistence);
    return driverConfig?.migrations?.runOnBootstrap;
  }

  private getDriverPersistenceConfig(
    persistence: ApiPersistenceConfig
  ): SqlPersistenceExtras | undefined {
    switch (persistence.driver) {
      case "sqlite":
        return persistence.sqlite as SqlPersistenceExtras | undefined;
      case "postgres":
        return persistence.postgres as SqlPersistenceExtras;
      case "mysql":
        return persistence.mysql as SqlPersistenceExtras;
      case "mariadb":
        return persistence.mariadb as SqlPersistenceExtras;
      default:
        return undefined;
    }
  }
}

interface SqlPersistenceExtras {
  migrations?: {
    runOnBootstrap?: boolean;
  };
}

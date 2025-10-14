import path from "node:path";
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { Knex } from "knex";

import { KNEX_INSTANCE } from "./knex.provider";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly migrationsConfig: Knex.MigratorConfig = {
    directory: path.join(process.cwd(), "apps", "api", "migrations"),
    loadExtensions: [".ts", ".js"],
    tableName: "knex_migrations",
  } satisfies Knex.MigratorConfig;

  constructor(@Inject(KNEX_INSTANCE) private readonly knex: Knex) {}

  getClient(): Knex {
    return this.knex;
  }

  async onModuleInit(): Promise<void> {
    await this.knex.migrate.latest(this.migrationsConfig);
  }

  async onModuleDestroy(): Promise<void> {
    await this.knex.destroy();
  }
}

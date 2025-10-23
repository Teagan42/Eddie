import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { Knex } from "knex";

import { KNEX_INSTANCE } from "./knex.provider";

export const API_PERSISTENCE_SKIP_MIGRATIONS_ENV =
  "API_PERSISTENCE_SKIP_MIGRATIONS" as const;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly migrationsConfig: Knex.MigratorConfig = {
    directory: path.join(process.cwd(), "apps", "api", "migrations"),
    loadExtensions: [".ts", ".js"],
    tableName: "knex_migrations",
  } satisfies Knex.MigratorConfig;

  constructor(
    @Inject(KNEX_INSTANCE)
    private readonly knex: Knex
  ) { }

  getClient(): Knex {
    const knex = this.knex;
    if (typeof knex === "undefined") {
      throw new Error("SQL persistence is not configured for the database module.");
    }
    return knex;
  }

  async onModuleInit(): Promise<void> {
    const knex = this.knex;
    if (typeof knex === "undefined" || !this.shouldRunMigrations()) {
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
    return process.env[API_PERSISTENCE_SKIP_MIGRATIONS_ENV] !== "true";
  }
}

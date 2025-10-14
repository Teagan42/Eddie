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
    private readonly knex?: Knex
  ) {}

  getClient(): Knex {
    if (!this.hasKnex()) {
      throw new Error("SQL persistence is not configured for the database module.");
    }
    return this.knex;
  }

  async onModuleInit(): Promise<void> {
    if (!this.hasKnex()) {
      return;
    }
    await this.ensureMigrationsDirectory();
    await this.knex.migrate.latest(this.migrationsConfig);
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.hasKnex()) {
      return;
    }
    await this.knex.destroy();
  }

  private async ensureMigrationsDirectory(): Promise<void> {
    if (!this.hasKnex()) {
      return;
    }
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

  private hasKnex(): this is { knex: Knex } {
    return typeof this.knex !== "undefined";
  }
}

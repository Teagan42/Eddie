import { describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { Knex } from "knex";

import { DatabaseService } from "../../../src/persistence/database.service";
import { KNEX_INSTANCE } from "../../../src/persistence/knex.provider";

describe("DatabaseService", () => {
  it("runs pending migrations during module initialization", async () => {
    const latest = vi.fn().mockResolvedValue({});
    const destroy = vi.fn().mockResolvedValue(undefined);
    const knex = {
      migrate: { latest },
      destroy,
    } as unknown as Knex;

    const moduleRef = await Test.createTestingModule({
      providers: [
        DatabaseService,
        { provide: KNEX_INSTANCE, useValue: knex },
      ],
    }).compile();

    const service = moduleRef.get(DatabaseService);
    await service.onModuleInit();

    expect(latest).toHaveBeenCalledTimes(1);
    expect(latest).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: expect.stringContaining("apps/api/migrations"),
      })
    );
  });

  it("closes the knex pool when the module is destroyed", async () => {
    const latest = vi.fn().mockResolvedValue({});
    const destroy = vi.fn().mockResolvedValue(undefined);
    const knex = {
      migrate: { latest },
      destroy,
    } as unknown as Knex;

    const moduleRef = await Test.createTestingModule({
      providers: [
        DatabaseService,
        { provide: KNEX_INSTANCE, useValue: knex },
      ],
    }).compile();

    const service = moduleRef.get(DatabaseService);
    await service.onModuleDestroy();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(latest).not.toHaveBeenCalled();
  });

  it("skips migrations when knex is not configured", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [DatabaseService],
    }).compile();

    const service = moduleRef.get(DatabaseService);

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(() => service.getClient()).toThrow(
      "SQL persistence is not configured for the database module."
    );
  });
});

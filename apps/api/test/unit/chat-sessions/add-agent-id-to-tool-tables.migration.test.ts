import type { Knex } from "knex";
import { describe, expect, it, vi } from "vitest";

import { addAgentIdToToolTablesMigration } from "../../../src/chat-sessions/migrations/add-agent-id-to-tool-tables";

describe("addAgentIdToToolTablesMigration", () => {
  const createSchemaStub = () => {
    const addedColumns: Record<string, string[]> = {};
    const schema = {
      hasTable: vi.fn().mockResolvedValue(true),
      alterTable: vi
        .fn()
        .mockImplementation(async (table: string, callback: (builder: Knex.AlterTableBuilder) => void) => {
          const columns: string[] = [];
          const builder = {
            string: vi.fn().mockImplementation((name: string) => {
              columns.push(name);
              return { nullable: vi.fn().mockReturnValue(undefined) } as unknown as Knex.ColumnBuilder;
            }),
          } as unknown as Knex.AlterTableBuilder;
          callback(builder);
          addedColumns[table] = columns;
        }),
    } satisfies Partial<Knex.SchemaBuilder>;

    return { schema, addedColumns };
  };

  it("adds agent columns when column inspection fails", async () => {
    const { schema, addedColumns } = createSchemaStub();

    const database = Object.assign(
      ((table: string) => ({
        columnInfo: vi
          .fn()
          .mockRejectedValue(new Error(`column inspection is not supported for ${table}`)),
      })) as unknown as Knex,
      {
        client: { config: { client: "better-sqlite3" } },
        schema: schema as Knex.SchemaBuilder,
        raw: vi.fn().mockResolvedValue({ rows: [] }),
      }
    );

    await expect(addAgentIdToToolTablesMigration(database)).resolves.not.toThrow();

    expect(schema.hasTable).toHaveBeenCalledWith("tool_calls");
    expect(schema.alterTable).toHaveBeenCalledWith(
      "tool_calls",
      expect.any(Function)
    );
    expect(schema.alterTable).toHaveBeenCalledWith(
      "tool_results",
      expect.any(Function)
    );
    expect(addedColumns.tool_calls).toContain("agent_id");
    expect(addedColumns.tool_results).toContain("agent_id");
  });

  it("adds agent columns when schema cannot report existing columns", async () => {
    const { schema, addedColumns } = createSchemaStub();

    const database = {
      client: { config: { client: "pg" } },
      schema: schema as Knex.SchemaBuilder,
    } as unknown as Knex;

    await expect(addAgentIdToToolTablesMigration(database)).resolves.not.toThrow();

    expect(schema.hasTable).toHaveBeenCalledWith("tool_calls");
    expect(schema.alterTable).toHaveBeenCalledTimes(2);
    expect(addedColumns.tool_calls).toContain("agent_id");
    expect(addedColumns.tool_results).toContain("agent_id");
  });

  it("does not fail when alterTable is unavailable", async () => {
    const schema = {
      hasTable: vi.fn().mockResolvedValue(true),
    } satisfies Partial<Knex.SchemaBuilder>;

    const database = {
      client: { config: { client: "pg" } },
      schema: schema as Knex.SchemaBuilder,
    } as unknown as Knex;

    await expect(addAgentIdToToolTablesMigration(database)).resolves.not.toThrow();
    expect(schema.hasTable).toHaveBeenCalledWith("tool_calls");
    expect(schema.hasTable).toHaveBeenCalledWith("tool_results");
  });
});

import type { Knex } from "knex";

const extractRows = (value: unknown): Array<{ name?: string }> => {
  if (Array.isArray(value)) {
    return value as Array<{ name?: string }>;
  }

  if (value && typeof value === "object") {
    const record = value as { [key: string]: unknown } & { rows?: unknown };

    if (Array.isArray(record.rows)) {
      return record.rows as Array<{ name?: string }>;
    }

    if (Array.isArray(record[0])) {
      return record[0] as Array<{ name?: string }>;
    }
  }

  return [];
};

const fallbackHasColumn = async (
  db: Knex,
  table: string,
  column: string
): Promise<boolean> => {
  const client = db.client?.config?.client;
  const normalized = typeof client === "string" ? client.toLowerCase() : `${client ?? ""}`;

  if (normalized.includes("sqlite")) {
    const escapedTable = table.replace(/'/g, "''");
    const result = await db.raw(`PRAGMA table_info('${escapedTable}')`);
    return extractRows(result).some((row) => row?.name === column);
  }

  if (typeof db.schema.hasColumn === "function") {
    return db.schema.hasColumn(table, column);
  }

  return false;
};

const tableHasColumn = async (db: Knex, table: string, column: string): Promise<boolean> => {
  if (!(await db.schema.hasTable(table))) {
    return false;
  }

  if (typeof db === "function") {
    try {
      const info = await db(table).columnInfo();
      if (Object.prototype.hasOwnProperty.call(info, column)) {
        return true;
      }
      return false;
    } catch {
      return fallbackHasColumn(db, table, column);
    }
  }

  return fallbackHasColumn(db, table, column);
};

export const addAgentIdToToolTablesMigration = async (db: Knex): Promise<void> => {
  const alterTable = typeof db.schema.alterTable === "function" ? db.schema.alterTable.bind(db.schema) : undefined;

  const ensureAgentColumn = async (tableName: "tool_calls" | "tool_results") => {
    if (!(await tableHasColumn(db, tableName, "agent_id"))) {
      await alterTable?.(tableName, (table) => {
        table.string("agent_id", 255).nullable();
      });
    }
  };

  await ensureAgentColumn("tool_calls");
  await ensureAgentColumn("tool_results");
};

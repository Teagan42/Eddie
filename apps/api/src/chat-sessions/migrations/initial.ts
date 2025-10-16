import type { Knex } from "knex";

type JsonStorageDialect = "jsonb" | "json" | "text";

const resolveJsonDialect = (client?: Knex.Config["client"]): JsonStorageDialect => {
  if (!client) {
    return "text";
  }
  const normalized = typeof client === "string" ? client : String(client);
  if (normalized === "pg") {
    return "jsonb";
  }
  if (normalized === "mysql" || normalized === "mysql2") {
    return "json";
  }
  return "text";
};

const addJsonColumn = (
  table: Knex.CreateTableBuilder,
  name: string,
  dialect: JsonStorageDialect,
  nullable: boolean
): Knex.ColumnBuilder => {
  let column: Knex.ColumnBuilder;
  if (dialect === "jsonb") {
    column = table.jsonb(name);
  } else if (dialect === "json") {
    column = table.json(name);
  } else {
    column = table.text(name);
  }
  return nullable ? column.nullable() : column.notNullable();
};

export const initialChatSessionsMigration = async (db: Knex): Promise<void> => {
  const dialect = resolveJsonDialect(db.client.config?.client);

  if (!(await db.schema.hasTable("chat_sessions"))) {
    await db.schema.createTable("chat_sessions", (table) => {
      table.uuid("id").primary();
      table.string("title", 255).notNullable();
      table.text("description").nullable();
      table.string("status", 32).notNullable().defaultTo("active");
      table.timestamp("created_at", { useTz: true }).notNullable();
      table.timestamp("updated_at", { useTz: true }).notNullable();
    });
  }

  if (!(await db.schema.hasTable("chat_session_api_keys"))) {
    await db.schema.createTable("chat_session_api_keys", (table) => {
      table
        .uuid("session_id")
        .notNullable()
        .references("id")
        .inTable("chat_sessions")
        .onDelete("CASCADE");
      table.string("api_key", 255).notNullable();
      table.primary(["api_key", "session_id"], "chat_session_api_keys_pk");
      table.index(["api_key"], "chat_session_api_keys_api_key_idx");
    });
  }

  if (!(await db.schema.hasTable("chat_messages"))) {
    await db.schema.createTable("chat_messages", (table) => {
      table.uuid("id").primary();
      table
        .uuid("session_id")
        .notNullable()
        .references("id")
        .inTable("chat_sessions")
        .onDelete("CASCADE");
      table.string("role", 32).notNullable();
      table.text("content").notNullable();
      table.timestamp("created_at", { useTz: true }).notNullable();
      table.string("tool_call_id", 255).nullable();
      table.string("name", 255).nullable();
      table.index(["session_id", "created_at"], "chat_messages_session_created_idx");
    });
  }

  if (!(await db.schema.hasTable("agent_invocations"))) {
    await db.schema.createTable("agent_invocations", (table) => {
      table
        .uuid("session_id")
        .primary()
        .references("id")
        .inTable("chat_sessions")
        .onDelete("CASCADE");

      addJsonColumn(table, "payload", dialect, false);
    });
  }

  if (!(await db.schema.hasTable("tool_calls"))) {
    await db.schema.createTable("tool_calls", (table) => {
      table.uuid("id").primary();
      table
        .uuid("session_id")
        .notNullable()
        .references("id")
        .inTable("chat_sessions")
        .onDelete("CASCADE");
      table
        .uuid("message_id")
        .nullable()
        .references("id")
        .inTable("chat_messages")
        .onDelete("CASCADE");
      table.string("tool_call_id", 255).nullable();
      table.string("name", 255).nullable();
      table.string("agent_id", 255).nullable();
      table.string("status", 32).notNullable();
      addJsonColumn(table, "arguments", dialect, true);
      table.string("agent_id", 255).nullable();
      table.timestamp("created_at", { useTz: true }).notNullable();
      table.timestamp("updated_at", { useTz: true }).notNullable();
      table.unique(
        ["session_id", "tool_call_id"],
        "tool_calls_session_tool_call_id_uq"
      );
      table.index(["session_id"], "tool_calls_session_idx");
    });
  }

  if (!(await db.schema.hasTable("tool_results"))) {
    await db.schema.createTable("tool_results", (table) => {
      table.uuid("id").primary();
      table
        .uuid("session_id")
        .notNullable()
        .references("id")
        .inTable("chat_sessions")
        .onDelete("CASCADE");
      table
        .uuid("message_id")
        .nullable()
        .references("id")
        .inTable("chat_messages")
        .onDelete("CASCADE");
      table.string("tool_call_id", 255).nullable();
      table.string("name", 255).nullable();
      table.string("agent_id", 255).nullable();
      addJsonColumn(table, "result", dialect, true);
      table.string("agent_id", 255).nullable();
      table.timestamp("created_at", { useTz: true }).notNullable();
      table.timestamp("updated_at", { useTz: true }).notNullable();
      table.unique(
        ["session_id", "tool_call_id"],
        "tool_results_session_tool_call_id_uq"
      );
      table.index(["session_id"], "tool_results_session_idx");
    });
  }
};

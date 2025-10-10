export type ChatSessionsSchemaDialect = "sqlite" | "postgres" | "mysql";

export interface ChatSessionsRelationalSchema {
  statements: string[];
  agentInvocationsUpsert: string;
}

const SQLITE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    tool_call_id TEXT,
    name TEXT,
    FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS agent_invocations (
    session_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
  );`,
];

const POSTGRES_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    tool_call_id TEXT,
    name TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS agent_invocations (
    session_id UUID PRIMARY KEY REFERENCES chat_sessions(id) ON DELETE CASCADE,
    payload JSONB NOT NULL
  );`,
];

const MYSQL_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS chat_sessions (
    id CHAR(36) PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NULL,
    status VARCHAR(20) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL
  ) ENGINE=InnoDB;`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id CHAR(36) PRIMARY KEY,
    session_id CHAR(36) NOT NULL,
    role VARCHAR(20) NOT NULL,
    content LONGTEXT NOT NULL,
    created_at DATETIME(6) NOT NULL,
    tool_call_id VARCHAR(255) NULL,
    name VARCHAR(255) NULL,
    CONSTRAINT fk_chat_messages_session FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB;`,
  `CREATE TABLE IF NOT EXISTS agent_invocations (
    session_id CHAR(36) PRIMARY KEY,
    payload JSON NOT NULL,
    CONSTRAINT fk_agent_invocations_session FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB;`,
];

const SQLITE_AGENT_INVOCATIONS_UPSERT = `
  INSERT INTO agent_invocations (session_id, payload)
  VALUES (?, ?)
  ON CONFLICT(session_id) DO UPDATE SET payload = excluded.payload
`;

const POSTGRES_AGENT_INVOCATIONS_UPSERT = `
  INSERT INTO agent_invocations (session_id, payload)
  VALUES ($1, $2::jsonb)
  ON CONFLICT (session_id) DO UPDATE SET payload = EXCLUDED.payload
`;

const MYSQL_AGENT_INVOCATIONS_UPSERT = `
  INSERT INTO agent_invocations (session_id, payload)
  VALUES (?, ?)
  ON DUPLICATE KEY UPDATE payload = VALUES(payload)
`;

export const createChatSessionsSchema = (
  dialect: ChatSessionsSchemaDialect
): ChatSessionsRelationalSchema => {
  switch (dialect) {
    case "sqlite":
      return {
        statements: SQLITE_STATEMENTS,
        agentInvocationsUpsert: SQLITE_AGENT_INVOCATIONS_UPSERT,
      };
    case "postgres":
      return {
        statements: POSTGRES_STATEMENTS,
        agentInvocationsUpsert: POSTGRES_AGENT_INVOCATIONS_UPSERT,
      };
    case "mysql":
      return {
        statements: MYSQL_STATEMENTS,
        agentInvocationsUpsert: MYSQL_AGENT_INVOCATIONS_UPSERT,
      };
    default:
      throw new Error(`Unsupported chat sessions schema dialect: ${dialect}`);
  }
};

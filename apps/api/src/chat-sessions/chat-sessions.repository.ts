import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "crypto";
import { OnModuleDestroy } from "@nestjs/common";
import Database from "better-sqlite3";
import type { Database as SqliteDatabase } from "better-sqlite3";
import { Pool, type PoolConfig, type PoolClient } from "pg";
import {
  createPool as createMysqlPool,
  type Pool as MysqlPool,
  type PoolOptions as MysqlPoolOptions,
  type RowDataPacket,
  type ResultSetHeader,
} from "mysql2/promise";

import { ChatMessageRole } from "./dto/create-chat-message.dto";
import {
  createChatSessionsSchema,
  type ChatSessionsRelationalSchema,
} from "./chat-sessions.schema";

export const CHAT_SESSIONS_REPOSITORY = Symbol("CHAT_SESSIONS_REPOSITORY");

export type ChatSessionStatus = "active" | "archived";

export interface ChatSessionRecord {
  id: string;
  title: string;
  description?: string;
  status: ChatSessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  createdAt: Date;
  toolCallId?: string;
  name?: string;
}

export interface AgentInvocationMessageSnapshot {
  role: ChatMessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface AgentInvocationSnapshot {
  id: string;
  messages: AgentInvocationMessageSnapshot[];
  children: AgentInvocationSnapshot[];
}

export interface CreateChatSessionInput {
  title: string;
  description?: string;
}

export interface CreateChatMessageInput {
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  toolCallId?: string;
  name?: string;
}

export interface ChatSessionsRepository {
  listSessions(): Promise<ChatSessionRecord[]>;
  getSessionById(id: string): Promise<ChatSessionRecord | undefined>;
  createSession(input: CreateChatSessionInput): Promise<ChatSessionRecord>;
  updateSessionStatus(
    id: string,
    status: ChatSessionStatus
  ): Promise<ChatSessionRecord | undefined>;
  appendMessage(
    input: CreateChatMessageInput
  ): Promise<
    { message: ChatMessageRecord; session: ChatSessionRecord } | undefined
  >;
  listMessages(sessionId: string): Promise<ChatMessageRecord[]>;
  updateMessageContent(
    sessionId: string,
    messageId: string,
    content: string
  ): Promise<ChatMessageRecord | undefined>;
  saveAgentInvocations(
    sessionId: string,
    snapshots: AgentInvocationSnapshot[]
  ): Promise<void>;
  listAgentInvocations(sessionId: string): Promise<AgentInvocationSnapshot[]>;
  onModuleDestroy?(): Promise<void> | void;
}

const cloneInvocation = (
  invocation: AgentInvocationSnapshot
): AgentInvocationSnapshot => ({
  id: invocation.id,
  messages: invocation.messages.map((message) => ({ ...message })),
  children: invocation.children.map((child) => cloneInvocation(child)),
});

const cloneSession = (session: ChatSessionRecord): ChatSessionRecord => ({
  ...session,
  createdAt: new Date(session.createdAt),
  updatedAt: new Date(session.updatedAt),
});

const cloneMessage = (message: ChatMessageRecord): ChatMessageRecord => ({
  ...message,
  createdAt: new Date(message.createdAt),
});

export class InMemoryChatSessionsRepository implements ChatSessionsRepository {
  private readonly sessions = new Map<string, ChatSessionRecord>();
  private readonly messages = new Map<string, ChatMessageRecord[]>();
  private readonly agentInvocations = new Map<
    string,
    AgentInvocationSnapshot[]
  >();

  async listSessions(): Promise<ChatSessionRecord[]> {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((session) => cloneSession(session));
  }

  async getSessionById(id: string): Promise<ChatSessionRecord | undefined> {
    const session = this.sessions.get(id);
    return session ? cloneSession(session) : undefined;
  }

  async createSession(input: CreateChatSessionInput): Promise<ChatSessionRecord> {
    const now = new Date();
    const session: ChatSessionRecord = {
      id: randomUUID(),
      title: input.title,
      description: input.description,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);
    this.messages.set(session.id, []);
    return cloneSession(session);
  }

  async updateSessionStatus(
    id: string,
    status: ChatSessionStatus
  ): Promise<ChatSessionRecord | undefined> {
    const session = this.sessions.get(id);
    if (!session) {
      return undefined;
    }
    session.status = status;
    session.updatedAt = new Date();
    return cloneSession(session);
  }

  async appendMessage(
    input: CreateChatMessageInput
  ): Promise<
    { message: ChatMessageRecord; session: ChatSessionRecord } | undefined
  > {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      return undefined;
    }
    const now = new Date();
    const message: ChatMessageRecord = {
      id: randomUUID(),
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      createdAt: now,
      toolCallId: input.toolCallId,
      name: input.name,
    };
    const collection = this.messages.get(input.sessionId);
    if (!collection) {
      this.messages.set(input.sessionId, [message]);
    } else {
      collection.push(message);
    }
    session.updatedAt = now;
    return {
      message: cloneMessage(message),
      session: cloneSession(session),
    };
  }

  async listMessages(sessionId: string): Promise<ChatMessageRecord[]> {
    const collection = this.messages.get(sessionId) ?? [];
    return collection
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((message) => cloneMessage(message));
  }

  async updateMessageContent(
    sessionId: string,
    messageId: string,
    content: string
  ): Promise<ChatMessageRecord | undefined> {
    const collection = this.messages.get(sessionId);
    if (!collection) {
      return undefined;
    }
    const message = collection.find((item) => item.id === messageId);
    if (!message) {
      return undefined;
    }
    message.content = content;
    return cloneMessage(message);
  }

  async saveAgentInvocations(
    sessionId: string,
    snapshots: AgentInvocationSnapshot[]
  ): Promise<void> {
    if (snapshots.length === 0) {
      this.agentInvocations.delete(sessionId);
      return;
    }
    const cloned = snapshots.map((snapshot) => cloneInvocation(snapshot));
    this.agentInvocations.set(sessionId, cloned);
  }

  async listAgentInvocations(
    sessionId: string
  ): Promise<AgentInvocationSnapshot[]> {
    const stored = this.agentInvocations.get(sessionId);
    if (!stored) {
      return [];
    }
    return stored.map((snapshot) => cloneInvocation(snapshot));
  }
}

export interface SqliteChatSessionsRepositoryOptions {
  filename: string;
}

export interface PostgresChatSessionsRepositoryOptions extends PoolConfig {}

export interface MysqlChatSessionsRepositoryOptions extends MysqlPoolOptions {}

interface ChatSessionRow {
  id: string;
  title: string;
  description: string | null;
  status: ChatSessionStatus;
  created_at: string;
  updated_at: string;
}

interface ChatMessageRow {
  id: string;
  session_id: string;
  role: ChatMessageRole;
  content: string;
  created_at: string;
  tool_call_id: string | null;
  name: string | null;
}

const mapSessionRow = (row: ChatSessionRow): ChatSessionRecord => ({
  id: row.id,
  title: row.title,
  description: row.description ?? undefined,
  status: row.status,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

const mapMessageRow = (row: ChatMessageRow): ChatMessageRecord => ({
  id: row.id,
  sessionId: row.session_id,
  role: row.role,
  content: row.content,
  createdAt: new Date(row.created_at),
  toolCallId: row.tool_call_id ?? undefined,
  name: row.name ?? undefined,
});

export class SqliteChatSessionsRepository
implements ChatSessionsRepository, OnModuleDestroy
{
  private readonly db: SqliteDatabase;
  private readonly schema: ChatSessionsRelationalSchema;

  constructor(options: SqliteChatSessionsRepositoryOptions) {
    if (options.filename !== ":memory:") {
      const directory = dirname(options.filename);
      if (directory && directory !== ".") {
        mkdirSync(directory, { recursive: true });
      }
    }
    this.db = new Database(options.filename);
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    this.schema = createChatSessionsSchema("sqlite");
    this.applyMigrations();
  }

  async onModuleDestroy(): Promise<void> {
    this.db.close();
  }

  async listSessions(): Promise<ChatSessionRecord[]> {
    const rows = this.db
      .prepare<[], ChatSessionRow>(
        `SELECT id, title, description, status, created_at, updated_at
         FROM chat_sessions
         ORDER BY datetime(updated_at) DESC`
      )
      .all();
    return rows.map(mapSessionRow);
  }

  async getSessionById(id: string): Promise<ChatSessionRecord | undefined> {
    const row = this.db
      .prepare<[string], ChatSessionRow>(
        `SELECT id, title, description, status, created_at, updated_at
         FROM chat_sessions
         WHERE id = ?`
      )
      .get(id);
    return row ? mapSessionRow(row) : undefined;
  }

  async createSession(
    input: CreateChatSessionInput
  ): Promise<ChatSessionRecord> {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO chat_sessions (id, title, description, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?)`
      )
      .run(id, input.title, input.description ?? null, now, now);
    return (await this.getSessionById(id))!;
  }

  async updateSessionStatus(
    id: string,
    status: ChatSessionStatus
  ): Promise<ChatSessionRecord | undefined> {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE chat_sessions
         SET status = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(status, now, id);
    if (result.changes === 0) {
      return undefined;
    }
    return (await this.getSessionById(id))!;
  }

  async appendMessage(
    input: CreateChatMessageInput
  ): Promise<
    { message: ChatMessageRecord; session: ChatSessionRecord } | undefined
  > {
    const run = this.db.transaction((data: CreateChatMessageInput) => {
      const session = this.db
        .prepare<[string], ChatSessionRow>(
          `SELECT id, title, description, status, created_at, updated_at
           FROM chat_sessions
           WHERE id = ?`
        )
        .get(data.sessionId);
      if (!session) {
        return undefined;
      }
      const now = new Date().toISOString();
      const id = randomUUID();
      this.db
        .prepare(
          `INSERT INTO chat_messages (id, session_id, role, content, created_at, tool_call_id, name)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          data.sessionId,
          data.role,
          data.content,
          now,
          data.toolCallId ?? null,
          data.name ?? null
        );
      this.db
        .prepare(
          `UPDATE chat_sessions
           SET updated_at = ?
           WHERE id = ?`
        )
        .run(now, data.sessionId);
      const messageRow = this.db
        .prepare<[string], ChatMessageRow>(
          `SELECT id, session_id, role, content, created_at, tool_call_id, name
           FROM chat_messages
           WHERE id = ?`
        )
        .get(id)!;
      const sessionRow = this.db
        .prepare<[string], ChatSessionRow>(
          `SELECT id, title, description, status, created_at, updated_at
           FROM chat_sessions
           WHERE id = ?`
        )
        .get(data.sessionId)!;
      return {
        message: mapMessageRow(messageRow),
        session: mapSessionRow(sessionRow),
      };
    });
    return run(input);
  }

  async listMessages(sessionId: string): Promise<ChatMessageRecord[]> {
    const rows = this.db
      .prepare<[string], ChatMessageRow>(
        `SELECT id, session_id, role, content, created_at, tool_call_id, name
         FROM chat_messages
         WHERE session_id = ?
         ORDER BY datetime(created_at) ASC`
      )
      .all(sessionId);
    return rows.map(mapMessageRow);
  }

  async updateMessageContent(
    sessionId: string,
    messageId: string,
    content: string
  ): Promise<ChatMessageRecord | undefined> {
    const result = this.db
      .prepare(
        `UPDATE chat_messages
         SET content = ?
         WHERE id = ? AND session_id = ?`
      )
      .run(content, messageId, sessionId);
    if (result.changes === 0) {
      return undefined;
    }
    const row = this.db
      .prepare<[string], ChatMessageRow>(
        `SELECT id, session_id, role, content, created_at, tool_call_id, name
         FROM chat_messages
         WHERE id = ?`
      )
      .get(messageId)!;
    return mapMessageRow(row);
  }

  async saveAgentInvocations(
    sessionId: string,
    snapshots: AgentInvocationSnapshot[]
  ): Promise<void> {
    if (snapshots.length === 0) {
      this.db
        .prepare(`DELETE FROM agent_invocations WHERE session_id = ?`)
        .run(sessionId);
      return;
    }
    const payload = JSON.stringify(
      snapshots.map((snapshot) => cloneInvocation(snapshot))
    );
    this.db
      .prepare(
        this.schema.agentInvocationsUpsert
      )
      .run(sessionId, payload);
  }

  async listAgentInvocations(
    sessionId: string
  ): Promise<AgentInvocationSnapshot[]> {
    const row = this.db
      .prepare<[string], { payload: string }>(
        `SELECT payload FROM agent_invocations WHERE session_id = ?`
      )
      .get(sessionId);
    if (!row) {
      return [];
    }
    const parsed = JSON.parse(row.payload) as AgentInvocationSnapshot[];
    return parsed.map((snapshot) => cloneInvocation(snapshot));
  }

  private applyMigrations(): void {
    this.db.exec(this.schema.statements.join("\n"));
  }
}

interface PostgresChatSessionRow extends ChatSessionRow {}

interface PostgresChatMessageRow extends ChatMessageRow {}

interface MysqlChatSessionRow extends ChatSessionRow, RowDataPacket {}

interface MysqlChatMessageRow extends ChatMessageRow, RowDataPacket {}

export class PostgresChatSessionsRepository
implements ChatSessionsRepository, OnModuleDestroy
{
  private readonly pool: Pool;
  private readonly schema: ChatSessionsRelationalSchema;
  private readonly ready: Promise<void>;

  constructor(options: PostgresChatSessionsRepositoryOptions) {
    this.pool = new Pool(options);
    this.schema = createChatSessionsSchema("postgres");
    this.ready = this.applyMigrations();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  private async applyMigrations(): Promise<void> {
    const client = await this.pool.connect();
    try {
      for (const statement of this.schema.statements) {
        await client.query(statement);
      }
    } finally {
      client.release();
    }
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  private async withClient<T>(
    handler: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await handler(client);
    } finally {
      client.release();
    }
  }

  async listSessions(): Promise<ChatSessionRecord[]> {
    await this.ensureReady();
    const result = await this.pool.query<PostgresChatSessionRow>(
      `SELECT id, title, description, status, created_at, updated_at
       FROM chat_sessions
       ORDER BY updated_at DESC`
    );
    return result.rows.map(mapSessionRow);
  }

  async getSessionById(id: string): Promise<ChatSessionRecord | undefined> {
    await this.ensureReady();
    const result = await this.pool.query<PostgresChatSessionRow>(
      `SELECT id, title, description, status, created_at, updated_at
       FROM chat_sessions
       WHERE id = $1`,
      [id]
    );
    const row = result.rows[0];
    return row ? mapSessionRow(row) : undefined;
  }

  async createSession(
    input: CreateChatSessionInput
  ): Promise<ChatSessionRecord> {
    await this.ensureReady();
    const now = new Date().toISOString();
    const id = randomUUID();
    const result = await this.pool.query<PostgresChatSessionRow>(
      `INSERT INTO chat_sessions (id, title, description, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', $4, $5)
       RETURNING id, title, description, status, created_at, updated_at`,
      [id, input.title, input.description ?? null, now, now]
    );
    return mapSessionRow(result.rows[0]!);
  }

  async updateSessionStatus(
    id: string,
    status: ChatSessionStatus
  ): Promise<ChatSessionRecord | undefined> {
    await this.ensureReady();
    const now = new Date().toISOString();
    const result = await this.pool.query<PostgresChatSessionRow>(
      `UPDATE chat_sessions
       SET status = $1, updated_at = $2
       WHERE id = $3
       RETURNING id, title, description, status, created_at, updated_at`,
      [status, now, id]
    );
    const row = result.rows[0];
    return row ? mapSessionRow(row) : undefined;
  }

  async appendMessage(
    input: CreateChatMessageInput
  ): Promise<
    { message: ChatMessageRecord; session: ChatSessionRecord } | undefined
  > {
    await this.ensureReady();
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const sessionResult = await client.query<PostgresChatSessionRow>(
          `SELECT id, title, description, status, created_at, updated_at
           FROM chat_sessions
           WHERE id = $1`,
          [input.sessionId]
        );
        if (sessionResult.rowCount === 0) {
          await client.query("ROLLBACK");
          return undefined;
        }

        const now = new Date().toISOString();
        const id = randomUUID();
        const messageResult = await client.query<PostgresChatMessageRow>(
          `INSERT INTO chat_messages (id, session_id, role, content, created_at, tool_call_id, name)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, session_id, role, content, created_at, tool_call_id, name`,
          [
            id,
            input.sessionId,
            input.role,
            input.content,
            now,
            input.toolCallId ?? null,
            input.name ?? null,
          ]
        );

        const sessionUpdate = await client.query<PostgresChatSessionRow>(
          `UPDATE chat_sessions
           SET updated_at = $1
           WHERE id = $2
           RETURNING id, title, description, status, created_at, updated_at`,
          [now, input.sessionId]
        );

        await client.query("COMMIT");

        return {
          message: mapMessageRow(messageResult.rows[0]!),
          session: mapSessionRow(sessionUpdate.rows[0]!),
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async listMessages(sessionId: string): Promise<ChatMessageRecord[]> {
    await this.ensureReady();
    const result = await this.pool.query<PostgresChatMessageRow>(
      `SELECT id, session_id, role, content, created_at, tool_call_id, name
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );
    return result.rows.map(mapMessageRow);
  }

  async updateMessageContent(
    sessionId: string,
    messageId: string,
    content: string
  ): Promise<ChatMessageRecord | undefined> {
    await this.ensureReady();
    const result = await this.pool.query<PostgresChatMessageRow>(
      `UPDATE chat_messages
       SET content = $1
       WHERE id = $2 AND session_id = $3
       RETURNING id, session_id, role, content, created_at, tool_call_id, name`,
      [content, messageId, sessionId]
    );
    const row = result.rows[0];
    return row ? mapMessageRow(row) : undefined;
  }

  async saveAgentInvocations(
    sessionId: string,
    snapshots: AgentInvocationSnapshot[]
  ): Promise<void> {
    await this.ensureReady();
    if (snapshots.length === 0) {
      await this.pool.query(`DELETE FROM agent_invocations WHERE session_id = $1`, [
        sessionId,
      ]);
      return;
    }
    const payload = JSON.stringify(
      snapshots.map((snapshot) => cloneInvocation(snapshot))
    );
    await this.pool.query(this.schema.agentInvocationsUpsert, [
      sessionId,
      payload,
    ]);
  }

  async listAgentInvocations(
    sessionId: string
  ): Promise<AgentInvocationSnapshot[]> {
    await this.ensureReady();
    const result = await this.pool.query<{ payload: unknown }>(
      `SELECT payload FROM agent_invocations WHERE session_id = $1`,
      [sessionId]
    );
    const row = result.rows[0];
    if (!row || !row.payload) {
      return [];
    }
    const raw =
      typeof row.payload === "string"
        ? JSON.parse(row.payload)
        : row.payload;
    const snapshots = Array.isArray(raw) ? raw : [];
    return (snapshots as AgentInvocationSnapshot[]).map((snapshot) =>
      cloneInvocation(snapshot)
    );
  }
}

export class MysqlChatSessionsRepository
implements ChatSessionsRepository, OnModuleDestroy
{
  private readonly pool: MysqlPool;
  private readonly schema: ChatSessionsRelationalSchema;
  private readonly ready: Promise<void>;

  constructor(options: MysqlChatSessionsRepositoryOptions) {
    this.pool = createMysqlPool(options);
    this.schema = createChatSessionsSchema("mysql");
    this.ready = this.applyMigrations();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  private async applyMigrations(): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      for (const statement of this.schema.statements) {
        await connection.query(statement);
      }
    } finally {
      connection.release();
    }
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  async listSessions(): Promise<ChatSessionRecord[]> {
    await this.ensureReady();
    const [rows] = await this.pool.query<MysqlChatSessionRow[]>(
      `SELECT id, title, description, status, created_at, updated_at
       FROM chat_sessions
       ORDER BY updated_at DESC`
    );
    return rows.map(mapSessionRow);
  }

  async getSessionById(id: string): Promise<ChatSessionRecord | undefined> {
    await this.ensureReady();
    const [rows] = await this.pool.query<MysqlChatSessionRow[]>(
      `SELECT id, title, description, status, created_at, updated_at
       FROM chat_sessions
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    const row = rows[0];
    return row ? mapSessionRow(row) : undefined;
  }

  async createSession(
    input: CreateChatSessionInput
  ): Promise<ChatSessionRecord> {
    await this.ensureReady();
    const now = new Date();
    const id = randomUUID();
    await this.pool.execute<ResultSetHeader>(
      `INSERT INTO chat_sessions (id, title, description, status, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      [id, input.title, input.description ?? null, now, now]
    );
    return (await this.getSessionById(id))!;
  }

  async updateSessionStatus(
    id: string,
    status: ChatSessionStatus
  ): Promise<ChatSessionRecord | undefined> {
    await this.ensureReady();
    const now = new Date();
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE chat_sessions
       SET status = ?, updated_at = ?
       WHERE id = ?`,
      [status, now, id]
    );
    const { affectedRows } = result;
    if (!affectedRows) {
      return undefined;
    }
    return (await this.getSessionById(id))!;
  }

  async appendMessage(
    input: CreateChatMessageInput
  ): Promise<
    { message: ChatMessageRecord; session: ChatSessionRecord } | undefined
  > {
    await this.ensureReady();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [sessionRows] = await connection.query<MysqlChatSessionRow[]>(
        `SELECT id, title, description, status, created_at, updated_at
         FROM chat_sessions
         WHERE id = ?
         LIMIT 1`,
        [input.sessionId]
      );
      if (sessionRows.length === 0) {
        await connection.rollback();
        return undefined;
      }

      const now = new Date();
      const id = randomUUID();
      await connection.execute<ResultSetHeader>(
        `INSERT INTO chat_messages (id, session_id, role, content, created_at, tool_call_id, name)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.sessionId,
          input.role,
          input.content,
          now,
          input.toolCallId ?? null,
          input.name ?? null,
        ]
      );
      await connection.execute<ResultSetHeader>(
        `UPDATE chat_sessions
         SET updated_at = ?
         WHERE id = ?`,
        [now, input.sessionId]
      );
      const [messageRows] = await connection.query<MysqlChatMessageRow[]>(
        `SELECT id, session_id, role, content, created_at, tool_call_id, name
         FROM chat_messages
         WHERE id = ?
         LIMIT 1`,
        [id]
      );
      const [updatedSessionRows] = await connection.query<MysqlChatSessionRow[]>(
        `SELECT id, title, description, status, created_at, updated_at
         FROM chat_sessions
         WHERE id = ?
         LIMIT 1`,
        [input.sessionId]
      );
      await connection.commit();
      return {
        message: mapMessageRow(messageRows[0]!),
        session: mapSessionRow(updatedSessionRows[0]!),
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async listMessages(sessionId: string): Promise<ChatMessageRecord[]> {
    await this.ensureReady();
    const [rows] = await this.pool.query<MysqlChatMessageRow[]>(
      `SELECT id, session_id, role, content, created_at, tool_call_id, name
       FROM chat_messages
       WHERE session_id = ?
       ORDER BY created_at ASC`,
      [sessionId]
    );
    return rows.map(mapMessageRow);
  }

  async updateMessageContent(
    sessionId: string,
    messageId: string,
    content: string
  ): Promise<ChatMessageRecord | undefined> {
    await this.ensureReady();
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE chat_messages
       SET content = ?
       WHERE id = ? AND session_id = ?`,
      [content, messageId, sessionId]
    );
    const { affectedRows } = result;
    if (!affectedRows) {
      return undefined;
    }
    const [rows] = await this.pool.query<MysqlChatMessageRow[]>(
      `SELECT id, session_id, role, content, created_at, tool_call_id, name
       FROM chat_messages
       WHERE id = ?
       LIMIT 1`,
      [messageId]
    );
    const row = rows[0];
    return row ? mapMessageRow(row) : undefined;
  }

  async saveAgentInvocations(
    sessionId: string,
    snapshots: AgentInvocationSnapshot[]
  ): Promise<void> {
    await this.ensureReady();
    if (snapshots.length === 0) {
      await this.pool.execute(`DELETE FROM agent_invocations WHERE session_id = ?`, [
        sessionId,
      ]);
      return;
    }
    const payload = JSON.stringify(
      snapshots.map((snapshot) => cloneInvocation(snapshot))
    );
    await this.pool.execute<ResultSetHeader>(this.schema.agentInvocationsUpsert, [
      sessionId,
      payload,
    ]);
  }

  async listAgentInvocations(
    sessionId: string
  ): Promise<AgentInvocationSnapshot[]> {
    await this.ensureReady();
    const [rows] = await this.pool.query<
      Array<{ payload: string | null } & RowDataPacket>
    >(
      `SELECT payload FROM agent_invocations WHERE session_id = ?
       LIMIT 1`,
      [sessionId]
    );
    const row = rows[0];
    if (!row?.payload) {
      return [];
    }
    const raw = JSON.parse(row.payload);
    const snapshots = Array.isArray(raw) ? raw : [];
    return (snapshots as AgentInvocationSnapshot[]).map((snapshot) =>
      cloneInvocation(snapshot)
    );
  }
}

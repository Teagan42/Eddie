import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "crypto";
import Database from "better-sqlite3";
import type { Database as SqliteDatabase } from "better-sqlite3";

import { ChatMessageRole } from "./dto/create-chat-message.dto";

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
  listSessions(): ChatSessionRecord[];
  getSessionById(id: string): ChatSessionRecord | undefined;
  createSession(input: CreateChatSessionInput): ChatSessionRecord;
  updateSessionStatus(
    id: string,
    status: ChatSessionStatus
  ): ChatSessionRecord | undefined;
  appendMessage(
    input: CreateChatMessageInput
  ): { message: ChatMessageRecord; session: ChatSessionRecord } | undefined;
  listMessages(sessionId: string): ChatMessageRecord[];
  updateMessageContent(
    sessionId: string,
    messageId: string,
    content: string
  ): ChatMessageRecord | undefined;
  saveAgentInvocations(
    sessionId: string,
    snapshots: AgentInvocationSnapshot[]
  ): void;
  listAgentInvocations(sessionId: string): AgentInvocationSnapshot[];
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

  listSessions(): ChatSessionRecord[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((session) => cloneSession(session));
  }

  getSessionById(id: string): ChatSessionRecord | undefined {
    const session = this.sessions.get(id);
    return session ? cloneSession(session) : undefined;
  }

  createSession(input: CreateChatSessionInput): ChatSessionRecord {
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

  updateSessionStatus(
    id: string,
    status: ChatSessionStatus
  ): ChatSessionRecord | undefined {
    const session = this.sessions.get(id);
    if (!session) {
      return undefined;
    }
    session.status = status;
    session.updatedAt = new Date();
    return cloneSession(session);
  }

  appendMessage(
    input: CreateChatMessageInput
  ): { message: ChatMessageRecord; session: ChatSessionRecord } | undefined {
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

  listMessages(sessionId: string): ChatMessageRecord[] {
    const collection = this.messages.get(sessionId) ?? [];
    return collection
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((message) => cloneMessage(message));
  }

  updateMessageContent(
    sessionId: string,
    messageId: string,
    content: string
  ): ChatMessageRecord | undefined {
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

  saveAgentInvocations(
    sessionId: string,
    snapshots: AgentInvocationSnapshot[]
  ): void {
    if (snapshots.length === 0) {
      this.agentInvocations.delete(sessionId);
      return;
    }
    const cloned = snapshots.map((snapshot) => cloneInvocation(snapshot));
    this.agentInvocations.set(sessionId, cloned);
  }

  listAgentInvocations(sessionId: string): AgentInvocationSnapshot[] {
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

export class SqliteChatSessionsRepository implements ChatSessionsRepository {
  private readonly db: SqliteDatabase;

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
    this.applyMigrations();
  }

  listSessions(): ChatSessionRecord[] {
    const rows = this.db
      .prepare<[], ChatSessionRow>(
        `SELECT id, title, description, status, created_at, updated_at
         FROM chat_sessions
         ORDER BY datetime(updated_at) DESC`
      )
      .all();
    return rows.map(mapSessionRow);
  }

  getSessionById(id: string): ChatSessionRecord | undefined {
    const row = this.db
      .prepare<[string], ChatSessionRow>(
        `SELECT id, title, description, status, created_at, updated_at
         FROM chat_sessions
         WHERE id = ?`
      )
      .get(id);
    return row ? mapSessionRow(row) : undefined;
  }

  createSession(input: CreateChatSessionInput): ChatSessionRecord {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO chat_sessions (id, title, description, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?)`
      )
      .run(id, input.title, input.description ?? null, now, now);
    return this.getSessionById(id)!;
  }

  updateSessionStatus(
    id: string,
    status: ChatSessionStatus
  ): ChatSessionRecord | undefined {
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
    return this.getSessionById(id)!;
  }

  appendMessage(
    input: CreateChatMessageInput
  ): { message: ChatMessageRecord; session: ChatSessionRecord } | undefined {
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

  listMessages(sessionId: string): ChatMessageRecord[] {
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

  updateMessageContent(
    sessionId: string,
    messageId: string,
    content: string
  ): ChatMessageRecord | undefined {
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

  saveAgentInvocations(
    sessionId: string,
    snapshots: AgentInvocationSnapshot[]
  ): void {
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
        `INSERT INTO agent_invocations (session_id, payload)
         VALUES (?, ?)
         ON CONFLICT(session_id) DO UPDATE SET payload = excluded.payload`
      )
      .run(sessionId, payload);
  }

  listAgentInvocations(sessionId: string): AgentInvocationSnapshot[] {
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
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        tool_call_id TEXT,
        name TEXT,
        FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS agent_invocations (
        session_id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      );
    `);
  }
}

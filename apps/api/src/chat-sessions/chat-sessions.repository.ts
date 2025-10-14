import { OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "crypto";
import knex, { type Knex } from "knex";

import { ChatMessageRole } from "./dto/create-chat-message.dto";
import { initialChatSessionsMigration } from "./migrations/initial";

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
  renameSession(
    id: string,
    title: string
  ): Promise<ChatSessionRecord | undefined>;
  updateSessionStatus(
    id: string,
    status: ChatSessionStatus
  ): Promise<ChatSessionRecord | undefined>;
  deleteSession(id: string): Promise<boolean>;
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

  async createSession(
    input: CreateChatSessionInput
  ): Promise<ChatSessionRecord> {
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

  async renameSession(
    id: string,
    title: string
  ): Promise<ChatSessionRecord | undefined> {
    const session = this.sessions.get(id);
    if (!session) {
      return undefined;
    }
    session.title = title;
    session.updatedAt = new Date();
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

  async deleteSession(id: string): Promise<boolean> {
    const removed = this.sessions.delete(id);
    this.messages.delete(id);
    this.agentInvocations.delete(id);
    return removed;
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

interface ChatSessionRow {
  id: string;
  title: string;
  description: string | null;
  status: ChatSessionStatus;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ChatMessageRow {
  id: string;
  session_id: string;
  role: ChatMessageRole;
  content: string;
  created_at: Date | string;
  tool_call_id: string | null;
  name: string | null;
}

interface AgentInvocationRow {
  session_id: string;
  payload: unknown;
}

const toDate = (value: Date | string): Date =>
  value instanceof Date ? new Date(value.getTime()) : new Date(value);

const mapSessionRow = (row: ChatSessionRow): ChatSessionRecord => ({
  id: row.id,
  title: row.title,
  description: row.description ?? undefined,
  status: row.status,
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at),
});

const mapMessageRow = (row: ChatMessageRow): ChatMessageRecord => ({
  id: row.id,
  sessionId: row.session_id,
  role: row.role,
  content: row.content,
  createdAt: toDate(row.created_at),
  toolCallId: row.tool_call_id ?? undefined,
  name: row.name ?? undefined,
});

type ChatSessionsMigration = (db: Knex) => Promise<void>;

const DEFAULT_MIGRATIONS: readonly ChatSessionsMigration[] = [
  initialChatSessionsMigration,
];

type JsonStorageDialect = "jsonb" | "json" | "text";

const resolveJsonStorageDialect = (client?: Knex.Config["client"]): JsonStorageDialect => {
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

export interface KnexChatSessionsRepositoryOptions {
  knex: Knex;
  ownsConnection?: boolean;
  migrations?: readonly ChatSessionsMigration[];
}

export class KnexChatSessionsRepository implements ChatSessionsRepository, OnModuleDestroy {
  private readonly knex: Knex;
  private readonly ownsConnection: boolean;
  private readonly ready: Promise<void>;
  private readonly jsonDialect: JsonStorageDialect;

  constructor(options: KnexChatSessionsRepositoryOptions) {
    this.knex = options.knex;
    this.ownsConnection = options.ownsConnection ?? false;
    this.jsonDialect = resolveJsonStorageDialect(this.knex.client.config?.client);
    const migrations = options.migrations ?? DEFAULT_MIGRATIONS;
    this.ready = this.applyMigrations(migrations);
  }

  private async applyMigrations(
    migrations: readonly ChatSessionsMigration[]
  ): Promise<void> {
    for (const migration of migrations) {
      await migration(this.knex);
    }
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  async listSessions(): Promise<ChatSessionRecord[]> {
    await this.ensureReady();
    const rows = await this.knex<ChatSessionRow>("chat_sessions")
      .select(
        "id",
        "title",
        "description",
        "status",
        "created_at",
        "updated_at"
      )
      .orderBy("updated_at", "desc");
    return rows.map(mapSessionRow);
  }

  async getSessionById(id: string): Promise<ChatSessionRecord | undefined> {
    await this.ensureReady();
    const row = await this.knex<ChatSessionRow>("chat_sessions")
      .select(
        "id",
        "title",
        "description",
        "status",
        "created_at",
        "updated_at"
      )
      .where({ id })
      .first();
    return row ? mapSessionRow(row) : undefined;
  }

  async createSession(
    input: CreateChatSessionInput
  ): Promise<ChatSessionRecord> {
    await this.ensureReady();
    const now = new Date();
    const id = randomUUID();
    await this.knex("chat_sessions").insert({
      id,
      title: input.title,
      description: input.description ?? null,
      status: "active",
      created_at: now,
      updated_at: now,
    });
    const session = await this.getSessionById(id);
    if (!session) {
      throw new Error(`Failed to load chat session ${id} after creation.`);
    }
    return session;
  }

  async renameSession(
    id: string,
    title: string
  ): Promise<ChatSessionRecord | undefined> {
    await this.ensureReady();
    const now = new Date();
    const updated = await this.knex("chat_sessions")
      .update({ title, updated_at: now })
      .where({ id });
    if (updated === 0) {
      return undefined;
    }
    return this.getSessionById(id);
  }

  async updateSessionStatus(
    id: string,
    status: ChatSessionStatus
  ): Promise<ChatSessionRecord | undefined> {
    await this.ensureReady();
    const now = new Date();
    const updated = await this.knex("chat_sessions")
      .update({ status, updated_at: now })
      .where({ id });
    if (updated === 0) {
      return undefined;
    }
    return this.getSessionById(id);
  }

  async appendMessage(
    input: CreateChatMessageInput
  ): Promise<
    { message: ChatMessageRecord; session: ChatSessionRecord } | undefined
  > {
    await this.ensureReady();
    return this.knex.transaction(async (trx) => {
      const session = await trx<ChatSessionRow>("chat_sessions")
        .select(
          "id",
          "title",
          "description",
          "status",
          "created_at",
          "updated_at"
        )
        .where({ id: input.sessionId })
        .first();
      if (!session) {
        return undefined;
      }
      const now = new Date();
      const messageId = randomUUID();
      await trx("chat_messages").insert({
        id: messageId,
        session_id: input.sessionId,
        role: input.role,
        content: input.content,
        created_at: now,
        tool_call_id: input.toolCallId ?? null,
        name: input.name ?? null,
      });
      await trx("chat_sessions")
        .update({ updated_at: now })
        .where({ id: input.sessionId });
      const messageRow = await trx<ChatMessageRow>("chat_messages")
        .select(
          "id",
          "session_id",
          "role",
          "content",
          "created_at",
          "tool_call_id",
          "name"
        )
        .where({ id: messageId })
        .first();
      const sessionRow = await trx<ChatSessionRow>("chat_sessions")
        .select(
          "id",
          "title",
          "description",
          "status",
          "created_at",
          "updated_at"
        )
        .where({ id: input.sessionId })
        .first();
      if (!messageRow || !sessionRow) {
        throw new Error("Failed to load persisted chat message or session");
      }
      return {
        message: mapMessageRow(messageRow),
        session: mapSessionRow(sessionRow),
      };
    });
  }

  async deleteSession(id: string): Promise<boolean> {
    await this.ensureReady();
    const deleted = await this.knex("chat_sessions").where({ id }).delete();
    return deleted > 0;
  }

  async listMessages(sessionId: string): Promise<ChatMessageRecord[]> {
    await this.ensureReady();
    const rows = await this.knex<ChatMessageRow>("chat_messages")
      .select(
        "id",
        "session_id",
        "role",
        "content",
        "created_at",
        "tool_call_id",
        "name"
      )
      .where({ session_id: sessionId })
      .orderBy("created_at", "asc");
    return rows.map(mapMessageRow);
  }

  async updateMessageContent(
    sessionId: string,
    messageId: string,
    content: string
  ): Promise<ChatMessageRecord | undefined> {
    await this.ensureReady();
    const updated = await this.knex("chat_messages")
      .update({ content })
      .where({ id: messageId, session_id: sessionId });
    if (updated === 0) {
      return undefined;
    }
    const row = await this.knex<ChatMessageRow>("chat_messages")
      .select(
        "id",
        "session_id",
        "role",
        "content",
        "created_at",
        "tool_call_id",
        "name"
      )
      .where({ id: messageId })
      .first();
    return row ? mapMessageRow(row) : undefined;
  }

  async saveAgentInvocations(
    sessionId: string,
    snapshots: AgentInvocationSnapshot[]
  ): Promise<void> {
    await this.ensureReady();
    if (snapshots.length === 0) {
      await this.knex("agent_invocations").where({ session_id: sessionId }).delete();
      return;
    }
    const cloned = snapshots.map((snapshot) => cloneInvocation(snapshot));
    const payload =
      this.jsonDialect === "text" ? JSON.stringify(cloned) : cloned;
    await this.knex("agent_invocations")
      .insert({
        session_id: sessionId,
        payload,
      })
      .onConflict("session_id")
      .merge({ payload });
  }

  async listAgentInvocations(
    sessionId: string
  ): Promise<AgentInvocationSnapshot[]> {
    await this.ensureReady();
    const row = await this.knex<AgentInvocationRow>("agent_invocations")
      .select("payload")
      .where({ session_id: sessionId })
      .first();
    if (!row) {
      return [];
    }
    const raw = row.payload;
    const parsed: AgentInvocationSnapshot[] = Array.isArray(raw)
      ? (raw as AgentInvocationSnapshot[])
      : typeof raw === "string"
        ? (JSON.parse(raw) as AgentInvocationSnapshot[])
        : (raw as AgentInvocationSnapshot[]);
    return parsed.map((snapshot) => cloneInvocation(snapshot));
  }

  async onModuleDestroy(): Promise<void> {
    if (this.ownsConnection) {
      try {
        await this.ensureReady();
      } catch {
        // ignore migration failures during shutdown
      }
      try {
        await this.knex.destroy();
      } catch (error) {
        if (error instanceof Error && error.message === "aborted") {
          return;
        }
        throw error;
      }
    }
  }
}

export interface SqliteChatSessionsRepositoryOptions {
  filename: string;
  migrations?: readonly ChatSessionsMigration[];
}

export class SqliteChatSessionsRepository extends KnexChatSessionsRepository {
  constructor(options: SqliteChatSessionsRepositoryOptions) {
    const connection = knex({
      client: "better-sqlite3",
      connection: {
        filename: options.filename,
      },
      useNullAsDefault: true,
    });
    void connection.raw("PRAGMA foreign_keys = ON");
    super({
      knex: connection,
      ownsConnection: true,
      migrations: options.migrations,
    });
  }
}

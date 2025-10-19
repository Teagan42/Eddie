import { OnModuleDestroy } from "@nestjs/common";
import { pbkdf2Sync, randomUUID } from "crypto";
import knex, { type Knex } from "knex";

import type {
  AgentInvocationMessageSnapshot,
  AgentInvocationSnapshot,
  ChatSessionStatus,
} from "@eddie/types";
import { ChatMessageRole } from "./dto/create-chat-message.dto";
import { initialChatSessionsMigration } from "./migrations/initial";
import { addAgentIdToToolTablesMigration } from "./migrations/add-agent-id-to-tool-tables";

export const CHAT_SESSIONS_REPOSITORY = Symbol("CHAT_SESSIONS_REPOSITORY");

export type { AgentInvocationMessageSnapshot, AgentInvocationSnapshot, ChatSessionStatus } from "@eddie/types";
export type ChatSessionAgentInvocationMessageSnapshot = AgentInvocationMessageSnapshot;

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

export interface CreateChatSessionInput {
  title: string;
  description?: string;
  apiKey?: string;
}

export interface UpdateChatSessionMetadataInput {
  title?: string;
  description?: string | null;
}

export interface CreateChatMessageInput {
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  toolCallId?: string;
  name?: string;
}

export interface ChatSessionSeedSnapshot {
  session: ChatSessionRecord;
  messages: ChatMessageRecord[];
  agentInvocations?: AgentInvocationSnapshot[];
  apiKeyHashes?: readonly string[];
}

export interface ChatSessionsRepository {
  listSessions(): Promise<ChatSessionRecord[]>;
  listSessionsForApiKey(apiKey: string): Promise<ChatSessionRecord[]>;
  getSessionById(id: string): Promise<ChatSessionRecord | undefined>;
  createSession(input: CreateChatSessionInput): Promise<ChatSessionRecord>;
  seedSession(snapshot: ChatSessionSeedSnapshot): Promise<void>;
  renameSession(
    id: string,
    title: string
  ): Promise<ChatSessionRecord | undefined>;
  updateSessionMetadata(
    id: string,
    patch: UpdateChatSessionMetadataInput
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
): AgentInvocationSnapshot => {
  const snapshot: AgentInvocationSnapshot = {
    id: invocation.id,
    messages: invocation.messages.map(
      (message: ChatSessionAgentInvocationMessageSnapshot) => ({ ...message })
    ),
    children: invocation.children.map((child) => cloneInvocation(child)),
  };

  if (invocation.provider) {
    snapshot.provider = invocation.provider;
  }
  if (invocation.model) {
    snapshot.model = invocation.model;
  }

  return snapshot;
};

const cloneSession = (session: ChatSessionRecord): ChatSessionRecord => ({
  ...session,
  createdAt: new Date(session.createdAt),
  updatedAt: new Date(session.updatedAt),
});

const cloneMessage = (message: ChatMessageRecord): ChatMessageRecord => ({
  ...message,
  createdAt: new Date(message.createdAt),
});

const normalizeApiKey = (apiKey?: string | null): string | null => {
  if (!apiKey) {
    return null;
  }
  const trimmed = apiKey.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const API_KEY_HASH_ITERATIONS = 310_000;
const API_KEY_HASH_KEY_LENGTH = 64;
const API_KEY_HASH_DIGEST = "sha512";
const API_KEY_HASH_SALT = "chat-session-api-key";

const hashApiKey = (apiKey: string): string =>
  pbkdf2Sync(
    apiKey,
    API_KEY_HASH_SALT,
    API_KEY_HASH_ITERATIONS,
    API_KEY_HASH_KEY_LENGTH,
    API_KEY_HASH_DIGEST
  ).toString("hex");

export class InMemoryChatSessionsRepository implements ChatSessionsRepository {
  private readonly sessions = new Map<string, ChatSessionRecord>();
  private readonly messages = new Map<string, ChatMessageRecord[]>();
  private readonly agentInvocations = new Map<
    string,
    AgentInvocationSnapshot[]
  >();
  private readonly apiKeyIndex = new Map<string, Set<string>>();

  private touchSession(session: ChatSessionRecord, timestamp?: number): void {
    const current = session.updatedAt.getTime();
    const next = timestamp ?? Date.now();
    session.updatedAt =
      next > current ? new Date(next) : new Date(current + 1);
  }

  private indexSession(sessionId: string, apiKey?: string): void {
    const key = normalizeApiKey(apiKey);
    if (!key) {
      return;
    }
    const hashed = hashApiKey(key);
    let sessionsForKey = this.apiKeyIndex.get(hashed);
    if (!sessionsForKey) {
      sessionsForKey = new Set<string>();
      this.apiKeyIndex.set(hashed, sessionsForKey);
    }
    sessionsForKey.add(sessionId);
  }

  private unindexSession(sessionId: string): void {
    for (const [key, sessions] of this.apiKeyIndex) {
      sessions.delete(sessionId);
      if (sessions.size === 0) {
        this.apiKeyIndex.delete(key);
      }
    }
  }

  async listSessions(): Promise<ChatSessionRecord[]> {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((session) => cloneSession(session));
  }

  async listSessionsForApiKey(apiKey: string): Promise<ChatSessionRecord[]> {
    const key = normalizeApiKey(apiKey);
    if (!key) {
      return [];
    }
    const hashed = hashApiKey(key);
    const sessionIds = this.apiKeyIndex.get(hashed);
    if (!sessionIds) {
      return [];
    }
    const sessions: ChatSessionRecord[] = [];
    for (const id of sessionIds) {
      const session = this.sessions.get(id);
      if (session) {
        sessions.push(cloneSession(session));
      }
    }
    return sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
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
    this.indexSession(session.id, input.apiKey);
    return cloneSession(session);
  }

  async seedSession(snapshot: ChatSessionSeedSnapshot): Promise<void> {
    const session: ChatSessionRecord = {
      id: snapshot.session.id,
      title: snapshot.session.title,
      description: snapshot.session.description,
      status: snapshot.session.status,
      createdAt: new Date(snapshot.session.createdAt),
      updatedAt: new Date(snapshot.session.updatedAt),
    };

    this.sessions.set(session.id, session);

    const messageCollection = snapshot.messages.map((message) => ({
      id: message.id,
      sessionId: message.sessionId,
      role: message.role,
      content: message.content,
      createdAt: new Date(message.createdAt),
      toolCallId: message.toolCallId,
      name: message.name,
    }));

    this.messages.set(session.id, messageCollection);

    if (snapshot.agentInvocations && snapshot.agentInvocations.length > 0) {
      const cloned = snapshot.agentInvocations.map((invocation) =>
        cloneInvocation(invocation)
      );
      this.agentInvocations.set(session.id, cloned);
    } else {
      this.agentInvocations.delete(session.id);
    }

    this.unindexSession(session.id);
    if (snapshot.apiKeyHashes) {
      for (const hash of snapshot.apiKeyHashes) {
        let sessionsForKey = this.apiKeyIndex.get(hash);
        if (!sessionsForKey) {
          sessionsForKey = new Set<string>();
          this.apiKeyIndex.set(hash, sessionsForKey);
        }
        sessionsForKey.add(session.id);
      }
    }
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
    this.touchSession(session);
    return cloneSession(session);
  }

  async updateSessionMetadata(
    id: string,
    patch: UpdateChatSessionMetadataInput
  ): Promise<ChatSessionRecord | undefined> {
    const session = this.sessions.get(id);
    if (!session) {
      return undefined;
    }
    if (
      Object.prototype.hasOwnProperty.call(patch, "title") &&
      patch.title !== undefined
    ) {
      session.title = patch.title;
    }
    if (
      Object.prototype.hasOwnProperty.call(patch, "description") &&
      patch.description !== undefined
    ) {
      session.description =
        patch.description === null ? undefined : patch.description;
    }
    this.touchSession(session);
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
    this.touchSession(session);
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
    this.touchSession(session, now.getTime());
    return {
      message: cloneMessage(message),
      session: cloneSession(session),
    };
  }

  async deleteSession(id: string): Promise<boolean> {
    const removed = this.sessions.delete(id);
    this.messages.delete(id);
    this.agentInvocations.delete(id);
    this.unindexSession(id);
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
  addAgentIdToToolTablesMigration,
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

  async listSessionsForApiKey(apiKey: string): Promise<ChatSessionRecord[]> {
    await this.ensureReady();
    const trimmed = normalizeApiKey(apiKey);
    if (!trimmed) {
      return [];
    }
    const hashed = hashApiKey(trimmed);
    const rows = await this.knex<ChatSessionRow>("chat_sessions")
      .join(
        "chat_session_api_keys",
        "chat_sessions.id",
        "chat_session_api_keys.session_id"
      )
      .select(
        "chat_sessions.id as id",
        "chat_sessions.title as title",
        "chat_sessions.description as description",
        "chat_sessions.status as status",
        "chat_sessions.created_at as created_at",
        "chat_sessions.updated_at as updated_at"
      )
      .where("chat_session_api_keys.api_key", hashed)
      .orderBy("chat_sessions.updated_at", "desc");
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
    const trimmedKey = normalizeApiKey(input.apiKey);
    await this.knex.transaction(async (trx) => {
      await trx("chat_sessions").insert({
        id,
        title: input.title,
        description: input.description ?? null,
        status: "active",
        created_at: now,
        updated_at: now,
      });
      if (trimmedKey) {
        await trx("chat_session_api_keys").insert({
          session_id: id,
          api_key: hashApiKey(trimmedKey),
        });
      }
    });
    const session = await this.getSessionById(id);
    if (!session) {
      throw new Error(`Failed to load chat session ${id} after creation.`);
    }
    return session;
  }

  async seedSession(snapshot: ChatSessionSeedSnapshot): Promise<void> {
    await this.ensureReady();
    await this.knex.transaction(async (trx) => {
      const sessionId = snapshot.session.id;

      await trx("tool_results").where({ session_id: sessionId }).delete();
      await trx("tool_calls").where({ session_id: sessionId }).delete();
      await trx("chat_messages").where({ session_id: sessionId }).delete();
      await trx("agent_invocations").where({ session_id: sessionId }).delete();
      await trx("chat_session_api_keys").where({ session_id: sessionId }).delete();
      await trx("chat_sessions").where({ id: sessionId }).delete();

      await trx("chat_sessions").insert({
        id: sessionId,
        title: snapshot.session.title,
        description: snapshot.session.description ?? null,
        status: snapshot.session.status,
        created_at: snapshot.session.createdAt,
        updated_at: snapshot.session.updatedAt,
      });

      if (snapshot.apiKeyHashes) {
        for (const hash of snapshot.apiKeyHashes) {
          await trx("chat_session_api_keys").insert({
            session_id: sessionId,
            api_key: hash,
          });
        }
      }

      for (const message of snapshot.messages) {
        const timestamp = new Date(message.createdAt);
        await trx("chat_messages").insert({
          id: message.id,
          session_id: sessionId,
          role: message.role,
          content: message.content,
          created_at: timestamp,
          tool_call_id: message.toolCallId ?? null,
          name: message.name ?? null,
        });

        if (message.toolCallId) {
          if (message.role === ChatMessageRole.Assistant) {
            await trx("tool_calls")
              .insert({
                id: randomUUID(),
                session_id: sessionId,
                tool_call_id: message.toolCallId,
                name: message.name ?? null,
                status: "running",
                arguments: null,
                message_id: message.id,
                created_at: timestamp,
                updated_at: timestamp,
              })
              .onConflict(["session_id", "tool_call_id"])
              .merge({
                message_id: message.id,
                name: message.name ?? null,
                updated_at: timestamp,
              });
          }

          if (message.role === ChatMessageRole.Tool) {
            await trx("tool_results")
              .insert({
                id: randomUUID(),
                session_id: sessionId,
                tool_call_id: message.toolCallId,
                name: message.name ?? null,
                result: null,
                message_id: message.id,
                created_at: timestamp,
                updated_at: timestamp,
              })
              .onConflict(["session_id", "tool_call_id"])
              .merge({
                message_id: message.id,
                name: message.name ?? null,
                updated_at: timestamp,
              });
          }
        }
      }

      if (snapshot.agentInvocations && snapshot.agentInvocations.length > 0) {
        const cloned = snapshot.agentInvocations.map((snapshotInvocation) =>
          cloneInvocation(snapshotInvocation)
        );
        const payload =
          this.jsonDialect === "text" ? JSON.stringify(cloned) : cloned;
        await trx("agent_invocations")
          .insert({ session_id: sessionId, payload })
          .onConflict("session_id")
          .merge({ payload });
      }
    });
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

  async updateSessionMetadata(
    id: string,
    patch: UpdateChatSessionMetadataInput
  ): Promise<ChatSessionRecord | undefined> {
    await this.ensureReady();
    return this.knex.transaction(async (trx) => {
      const now = new Date();
      const update: Record<string, unknown> = { updated_at: now };
      const hasTitle = Object.prototype.hasOwnProperty.call(patch, "title");
      const hasDescription = Object.prototype.hasOwnProperty.call(
        patch,
        "description"
      );
      if (hasTitle && patch.title !== undefined) {
        update.title = patch.title;
      }
      if (hasDescription && patch.description !== undefined) {
        update.description = patch.description ?? null;
      }
      const affected = await trx("chat_sessions").update(update).where({ id });
      if (affected === 0) {
        return undefined;
      }
      const row = await trx<ChatSessionRow>("chat_sessions")
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
      if (!row) {
        throw new Error(
          `Failed to load chat session ${id} after metadata update.`
        );
      }
      return mapSessionRow(row);
    });
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
      await this.linkToolLifecycleMessage(trx, messageId, input, now);
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

  private async linkToolLifecycleMessage(
    trx: Knex.Transaction,
    messageId: string,
    input: CreateChatMessageInput,
    timestamp: Date
  ): Promise<void> {
    if (!input.toolCallId) {
      return;
    }

    const updates: Record<string, unknown> = {
      message_id: messageId,
      updated_at: timestamp,
    };

    if (input.name !== undefined) {
      updates.name = input.name ?? null;
    }

    if (input.role === ChatMessageRole.Assistant) {
      await trx("tool_calls")
        .insert({
          id: randomUUID(),
          session_id: input.sessionId,
          tool_call_id: input.toolCallId,
          name: input.name ?? null,
          status: "running",
          arguments: null,
          message_id: messageId,
          created_at: timestamp,
          updated_at: timestamp,
        })
        .onConflict(["session_id", "tool_call_id"])
        .merge(updates);
      return;
    }

    if (input.role === ChatMessageRole.Tool) {
      await trx("tool_results")
        .insert({
          id: randomUUID(),
          session_id: input.sessionId,
          tool_call_id: input.toolCallId,
          name: input.name ?? null,
          result: null,
          message_id: messageId,
          created_at: timestamp,
          updated_at: timestamp,
        })
        .onConflict(["session_id", "tool_call_id"])
        .merge(updates);
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    await this.ensureReady();
    return this.knex.transaction(async (trx) => {
      const deleted = await trx("chat_sessions").where({ id }).delete();
      return deleted > 0;
    });
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

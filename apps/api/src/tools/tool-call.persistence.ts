import { Inject, Injectable, Optional } from "@nestjs/common";
import type { Knex } from "knex";
import { randomUUID } from "node:crypto";

import { KNEX_INSTANCE } from "../persistence/knex.provider";
import type { ToolCallState } from "./tool-call.store";

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

@Injectable()
export class ToolCallPersistenceService {
  private readonly knex: Knex | null;
  private readonly jsonDialect: JsonStorageDialect;

  constructor(@Optional() @Inject(KNEX_INSTANCE) knex?: Knex) {
    this.knex = knex ?? null;
    this.jsonDialect = resolveJsonDialect(this.knex?.client.config?.client);
  }

  async recordStart(state: ToolCallState): Promise<void> {
    if (!this.knex) {
      return;
    }
    await this.upsertCall(state, true);
  }

  async recordUpdate(state: ToolCallState): Promise<void> {
    if (!this.knex) {
      return;
    }
    await this.upsertCall(state, false);
  }

  async recordComplete(state: ToolCallState): Promise<void> {
    if (!this.knex) {
      return;
    }
    await this.knex.transaction(async (trx) => {
      await this.upsertCall(state, false, trx);
      await this.upsertResult(state, trx);
    });
  }

  private async upsertCall(
    state: ToolCallState,
    includeCreatedAt: boolean,
    trx?: Knex.Transaction
  ): Promise<void> {
    const db = trx ?? this.knex;
    if (!db) {
      return;
    }
    const updates = this.buildCallUpdates(state, includeCreatedAt);

    if (!state.toolCallId && !includeCreatedAt) {
      const anonymousTarget = await db("tool_calls")
        .where({ session_id: state.sessionId })
        .whereNull("tool_call_id")
        .whereNot("status", "completed")
        .orderBy("created_at", "asc")
        .first();

      if (anonymousTarget) {
        await db("tool_calls").where({ id: anonymousTarget.id }).update(updates);
        return;
      }
    }

    const insert = {
      id: randomUUID(),
      session_id: state.sessionId,
      tool_call_id: state.toolCallId ?? null,
      name: state.name ?? null,
      agent_id: state.agentId ?? null,
      status: state.status,
      arguments: this.prepareJson(state.arguments),
      message_id: null as string | null,
      created_at: this.toDate(state.startedAt),
      updated_at: this.toDate(state.updatedAt),
    };

    await db("tool_calls")
      .insert(insert)
      .onConflict(["session_id", "tool_call_id"])
      .merge(updates);
  }

  private async upsertResult(state: ToolCallState, trx: Knex.Transaction): Promise<void> {
    const insert = {
      id: randomUUID(),
      session_id: state.sessionId,
      tool_call_id: state.toolCallId ?? null,
      name: state.name ?? null,
      agent_id: state.agentId ?? null,
      result: this.prepareJson(state.result),
      message_id: null as string | null,
      created_at: this.toDate(state.updatedAt),
      updated_at: this.toDate(state.updatedAt),
    };

    const updates: Record<string, unknown> = {
      updated_at: this.toDate(state.updatedAt),
    };

    if (state.name !== undefined) {
      updates.name = state.name ?? null;
    }
    if (state.agentId !== undefined) {
      updates.agent_id = state.agentId ?? null;
    }
    if (state.result !== undefined) {
      updates.result = this.prepareJson(state.result);
    }
    if (state.agentId !== undefined) {
      updates.agent_id = state.agentId ?? null;
    }

    await trx("tool_results")
      .insert(insert)
      .onConflict(["session_id", "tool_call_id"])
      .merge(updates);
  }

  private prepareJson(value: unknown): unknown {
    if (value === undefined || value === null) {
      return null;
    }
    if (this.jsonDialect === "text") {
      return JSON.stringify(value);
    }
    return value;
  }

  private toDate(input: string): Date {
    return new Date(input);
  }

  private buildCallUpdates(
    state: ToolCallState,
    includeCreatedAt: boolean
  ): Record<string, unknown> {
    const updates: Record<string, unknown> = {
      status: state.status,
      updated_at: this.toDate(state.updatedAt),
    };

    if (state.name !== undefined) {
      updates.name = state.name ?? null;
    }
    if (state.agentId !== undefined) {
      updates.agent_id = state.agentId ?? null;
    }
    if (state.arguments !== undefined) {
      updates.arguments = this.prepareJson(state.arguments);
    }
    if (state.agentId !== undefined) {
      updates.agent_id = state.agentId ?? null;
    }

    if (includeCreatedAt) {
      updates.created_at = this.toDate(state.startedAt);
    }

    return updates;
  }
}

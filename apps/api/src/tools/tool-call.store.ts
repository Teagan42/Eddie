import { Injectable } from "@nestjs/common";

export type ToolCallStatus = "running" | "completed" | "failed";

export interface ToolCallState {
  sessionId: string;
  toolCallId?: string;
  name?: string;
  arguments?: unknown;
  result?: unknown;
  status: ToolCallStatus;
  startedAt: string;
  updatedAt: string;
}

export interface ToolCallCommandInput {
  sessionId: string;
  toolCallId?: string;
  name?: string;
  arguments?: unknown;
  result?: unknown;
  timestamp?: string;
}

@Injectable()
export class ToolCallStore {
  private readonly calls = new Map<string, ToolCallState[]>();

  start(input: ToolCallCommandInput): ToolCallState {
    const timestamp = this.resolveTimestamp(input.timestamp);
    const list = this.getSessionList(input.sessionId);
    const existing = this.findById(list, input.toolCallId);

    if (!existing) {
      const next: ToolCallState = {
        sessionId: input.sessionId,
        toolCallId: input.toolCallId,
        name: input.name,
        arguments: input.arguments,
        status: "running",
        result: undefined,
        startedAt: timestamp,
        updatedAt: timestamp,
      };
      list.push(next);
      return this.clone(next);
    }

    const nextStatus = existing.status === "completed" ? existing.status : "running";
    return this.applyUpdates(existing, input, timestamp, nextStatus);
  }

  update(input: ToolCallCommandInput): ToolCallState {
    const timestamp = this.resolveTimestamp(input.timestamp);
    const list = this.getSessionList(input.sessionId);
    const existing = this.findById(list, input.toolCallId);

    if (!existing) {
      const created: ToolCallState = {
        sessionId: input.sessionId,
        toolCallId: input.toolCallId,
        name: input.name,
        arguments: input.arguments,
        result: input.result,
        status: "running",
        startedAt: timestamp,
        updatedAt: timestamp,
      };
      list.push(created);
      return this.clone(created);
    }

    const nextStatus =
      existing.status === "completed" || existing.status === "failed"
        ? existing.status
        : "running";
    return this.applyUpdates(existing, input, timestamp, nextStatus);
  }

  complete(input: ToolCallCommandInput): ToolCallState {
    const timestamp = this.resolveTimestamp(input.timestamp);
    const list = this.getSessionList(input.sessionId);
    const existing = this.findById(list, input.toolCallId);

    if (!existing) {
      const created: ToolCallState = {
        sessionId: input.sessionId,
        toolCallId: input.toolCallId,
        name: input.name,
        arguments: input.arguments,
        result: input.result,
        status: "completed",
        startedAt: timestamp,
        updatedAt: timestamp,
      };
      list.push(created);
      return this.clone(created);
    }

    return this.applyUpdates(existing, input, timestamp, "completed");
  }

  list(sessionId?: string): ToolCallState[] {
    if (!sessionId) {
      return Array.from(this.calls.values()).flat().map((state) => ({ ...state }));
    }
    const list = this.calls.get(sessionId);
    if (!list) {
      return [];
    }
    return list.map((state) => this.clone(state));
  }

  private getSessionList(sessionId: string): ToolCallState[] {
    if (!this.calls.has(sessionId)) {
      this.calls.set(sessionId, []);
    }
    return this.calls.get(sessionId)!;
  }

  private findById(list: ToolCallState[], id?: string): ToolCallState | undefined {
    if (!id) {
      return undefined;
    }
    return list.find((state) => state.toolCallId === id);
  }

  private resolveTimestamp(input?: string): string {
    if (!input) {
      return new Date().toISOString();
    }
    return input;
  }

  private applyUpdates(
    target: ToolCallState,
    input: ToolCallCommandInput,
    timestamp: string,
    nextStatus: ToolCallStatus,
  ): ToolCallState {
    if (input.name !== undefined) {
      target.name = input.name;
    }
    if (input.arguments !== undefined) {
      target.arguments = input.arguments;
    }
    if (input.result !== undefined) {
      target.result = input.result;
    }
    target.status = nextStatus;
    target.updatedAt = timestamp;
    return this.clone(target);
  }

  private clone(state: ToolCallState): ToolCallState {
    return { ...state };
  }
}

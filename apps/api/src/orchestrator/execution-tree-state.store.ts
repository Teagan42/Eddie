import { Injectable } from "@nestjs/common";
import type { ExecutionTreeState } from "@eddie/types";

@Injectable()
export class ExecutionTreeStateStore {
  private readonly states = new Map<string, ExecutionTreeState>();

  set(sessionId: string, state: ExecutionTreeState): void {
    this.states.set(sessionId, this.clone(state));
  }

  get(sessionId: string): ExecutionTreeState | undefined {
    const stored = this.states.get(sessionId);
    return stored ? this.clone(stored) : undefined;
  }

  has(sessionId: string): boolean {
    return this.states.has(sessionId);
  }

  clear(sessionId: string): void {
    this.states.delete(sessionId);
  }

  private clone(state: ExecutionTreeState): ExecutionTreeState {
    if (typeof globalThis.structuredClone === "function") {
      return globalThis.structuredClone(state);
    }

    return JSON.parse(JSON.stringify(state)) as ExecutionTreeState;
  }
}

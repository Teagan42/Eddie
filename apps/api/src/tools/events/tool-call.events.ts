import type { IEvent } from "@nestjs/cqrs";
import type { ToolCallState } from "../tool-call.store";

export class ToolCallStarted implements IEvent {
  constructor(public readonly state: ToolCallState) {}
}

export class ToolCallUpdated implements IEvent {
  constructor(public readonly state: ToolCallState) {}
}

export class ToolCallCompleted implements IEvent {
  constructor(public readonly state: ToolCallState) {}
}

export type ToolCallLifecycleEvent =
  | ToolCallStarted
  | ToolCallUpdated
  | ToolCallCompleted;

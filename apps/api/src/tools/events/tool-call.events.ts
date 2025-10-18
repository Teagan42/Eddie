import type { IEvent } from "@nestjs/cqrs";
import type { ToolCallState } from "../tool-call.store";

const TOOL_CALL_EVENT_KIND = Symbol.for("@eddie/api/tools/tool-call-event-kind");

type ToolCallEventKind = "ToolCallStarted" | "ToolCallUpdated" | "ToolCallCompleted";

interface ToolCallLifecycleEventMarker {
  readonly [TOOL_CALL_EVENT_KIND]: ToolCallEventKind;
}

function matchesEventKind(
  instance: unknown,
  expected: ToolCallEventKind,
): instance is ToolCallLifecycleEventMarker {
  if (typeof instance !== "object" || instance === null) {
    return false;
  }

  return (instance as ToolCallLifecycleEventMarker)[TOOL_CALL_EVENT_KIND] === expected;
}

export class ToolCallStarted implements IEvent, ToolCallLifecycleEventMarker {
  readonly [TOOL_CALL_EVENT_KIND] = "ToolCallStarted" as const;

  constructor(public readonly state: ToolCallState) {}

  static [Symbol.hasInstance](instance: unknown): boolean {
    return matchesEventKind(instance, "ToolCallStarted");
  }
}

export class ToolCallUpdated implements IEvent, ToolCallLifecycleEventMarker {
  readonly [TOOL_CALL_EVENT_KIND] = "ToolCallUpdated" as const;

  constructor(public readonly state: ToolCallState) {}

  static [Symbol.hasInstance](instance: unknown): boolean {
    return matchesEventKind(instance, "ToolCallUpdated");
  }
}

export class ToolCallCompleted implements IEvent, ToolCallLifecycleEventMarker {
  readonly [TOOL_CALL_EVENT_KIND] = "ToolCallCompleted" as const;

  constructor(public readonly state: ToolCallState) {}

  static [Symbol.hasInstance](instance: unknown): boolean {
    return matchesEventKind(instance, "ToolCallCompleted");
  }
}

export type ToolCallLifecycleEvent =
  | ToolCallStarted
  | ToolCallUpdated
  | ToolCallCompleted;

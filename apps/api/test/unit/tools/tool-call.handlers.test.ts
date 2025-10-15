import { describe, expect, it, vi } from "vitest";
import type { EventBus } from "@nestjs/cqrs";
import { StartToolCallCommand } from "../../../src/tools/commands/start-tool-call.command";
import { UpdateToolCallCommand } from "../../../src/tools/commands/update-tool-call.command";
import { CompleteToolCallCommand } from "../../../src/tools/commands/complete-tool-call.command";
import { StartToolCallHandler } from "../../../src/tools/commands/start-tool-call.handler";
import { UpdateToolCallHandler } from "../../../src/tools/commands/update-tool-call.handler";
import { CompleteToolCallHandler } from "../../../src/tools/commands/complete-tool-call.handler";
import { GetToolCallsQuery } from "../../../src/tools/queries/get-tool-calls.query";
import { GetToolCallsHandler } from "../../../src/tools/queries/get-tool-calls.handler";
import { ToolCallStore } from "../../../src/tools/tool-call.store";
import { ToolCallStarted } from "../../../src/tools/events/tool-call.events";
import { ToolCallUpdated } from "../../../src/tools/events/tool-call.events";
import { ToolCallCompleted } from "../../../src/tools/events/tool-call.events";

describe("Tool call CQRS", () => {
  it("persists state across start, update, and complete commands", async () => {
    const store = new ToolCallStore();
    const events: unknown[] = [];
    const publish = vi.fn((event: unknown) => {
      events.push(event);
    });
    const eventBus = { publish } as unknown as EventBus;
    const startHandler = new StartToolCallHandler(store, eventBus);
    const updateHandler = new UpdateToolCallHandler(store, eventBus);
    const completeHandler = new CompleteToolCallHandler(store, eventBus);
    const queryHandler = new GetToolCallsHandler(store);

    await startHandler.execute(
      new StartToolCallCommand({
        sessionId: "s1",
        toolCallId: "t1",
        name: "search",
        arguments: { query: "docs" },
        timestamp: "2024-01-01T00:00:00.000Z",
      })
    );

    await updateHandler.execute(
      new UpdateToolCallCommand({
        sessionId: "s1",
        toolCallId: "t1",
        arguments: { query: "docs", page: 2 },
        timestamp: "2024-01-01T00:00:10.000Z",
      })
    );

    await completeHandler.execute(
      new CompleteToolCallCommand({
        sessionId: "s1",
        toolCallId: "t1",
        name: "search",
        result: { items: ["a", "b"] },
        timestamp: "2024-01-01T00:00:20.000Z",
      })
    );

    const [ toolCall ] = await queryHandler.execute(
      new GetToolCallsQuery({ sessionId: "s1" })
    );

    expect(toolCall).toMatchObject({
      sessionId: "s1",
      toolCallId: "t1",
      name: "search",
      status: "completed",
      arguments: { query: "docs", page: 2 },
      result: { items: ["a", "b"] },
      startedAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:20.000Z",
    });

    expect(events[0]).toBeInstanceOf(ToolCallStarted);
    expect(events[1]).toBeInstanceOf(ToolCallUpdated);
    expect(events[2]).toBeInstanceOf(ToolCallCompleted);

    const started = events[0] as ToolCallStarted;
    const updated = events[1] as ToolCallUpdated;
    const completed = events[2] as ToolCallCompleted;

    expect(started.state.status).toBe("running");
    expect(updated.state.arguments).toEqual({ query: "docs", page: 2 });
    expect(completed.state.result).toEqual({ items: ["a", "b"] });
  });
});

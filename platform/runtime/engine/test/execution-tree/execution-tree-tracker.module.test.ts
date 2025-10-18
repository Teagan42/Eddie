import { ExecutionTreeStateUpdatedEvent } from "@eddie/types";
import { describe, expect, it, vi } from "vitest";
import { ExecutionTreeTrackerFactory } from "../../src/execution-tree/execution-tree-tracker.factory";

const createDescriptor = (id: string) => ({
  id,
  definition: { id, systemPrompt: "", tools: [] },
  model: "gpt-test",
  provider: { name: "mock", stream: vi.fn() },
  metadata: {},
});

describe("ExecutionTreeTrackerFactory", () => {
  it("creates trackers that publish updates using the injected clock", () => {
    const fixedDate = new Date("2024-01-02T03:04:05.000Z");
    const now = vi.fn(() => fixedDate);
    const publish = vi.fn();

    const factory = new ExecutionTreeTrackerFactory(
      { publish } as unknown as { publish: (event: unknown) => void },
      now
    );
    const tracker = factory.create({ sessionId: "session-xyz" });

    tracker.registerAgent({
      agentId: "root-agent",
      descriptor: createDescriptor("root-agent"),
    });

    expect(now).toHaveBeenCalled();
    const event = publish.mock.calls[0]?.[0] as ExecutionTreeStateUpdatedEvent | undefined;
    expect(event).toBeDefined();
    expect(event?.sessionId).toBe("session-xyz");
    expect(event?.state).toMatchObject({
      createdAt: fixedDate.toISOString(),
      updatedAt: fixedDate.toISOString(),
    });
    expect(event).toBeInstanceOf(ExecutionTreeStateUpdatedEvent);
  });

  it("preserves context bundle source metadata when the tracker publishes", () => {
    const now = vi.fn(() => new Date("2024-04-05T06:07:08.000Z"));
    const publish = vi.fn();

    const factory = new ExecutionTreeTrackerFactory(
      { publish } as unknown as { publish: (event: unknown) => void },
      now
    );
    const tracker = factory.create({ sessionId: "session-abc" });

    tracker.registerAgent({
      agentId: "primary-agent",
      descriptor: createDescriptor("primary-agent"),
    });

    tracker.recordToolResult("primary-agent", {
      type: "tool_result",
      id: "call-1",
      name: "mock-tool",
      call_id: "call-1",
      result: "done",
    }, {
      type: "tool_result",
      result: "done",
      metadata: {
        contextBundles: [
          {
            id: "bundle-1",
            label: "Bundle",
            sizeBytes: 0,
            fileCount: 0,
            summary: "",
            source: {
              type: "spawn_subagent",
              agentId: "spawned-agent",
              toolCallId: "sub-call",
            },
          },
        ],
      },
    });

    const published = publish.mock.calls.pop()?.[0] as ExecutionTreeStateUpdatedEvent | undefined;
    expect(published).toBeInstanceOf(ExecutionTreeStateUpdatedEvent);
    const bundle = published?.state.contextBundles.find((entry) => entry.id === "bundle-1");
    expect(bundle?.source).toEqual({
      type: "spawn_subagent",
      agentId: "spawned-agent",
      toolCallId: "sub-call",
    });
  });
});

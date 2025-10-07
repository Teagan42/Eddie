import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { HookBus, HooksLoaderService } from "../../../src/hooks";

const lifecyclePayload = {
  metadata: {
    id: "agent",
    parentId: undefined,
    depth: 0,
    isRoot: true,
    systemPrompt: "system",
    tools: [],
  },
  prompt: "prompt",
  context: {
    totalBytes: 0,
    fileCount: 0,
  },
  historyLength: 0,
};

describe("HooksLoaderService", () => {
  it("attaches object-based lifecycle hooks", async () => {
    const loader = new HooksLoaderService();
    const bus = new HookBus();
    const beforeStart: unknown[] = [];

    loader.attachObjectHooks(bus, {
      beforeAgentStart: (payload) => {
        beforeStart.push(payload);
      },
    });

    await bus.emitAsync("beforeAgentStart", lifecyclePayload);

    expect(beforeStart).toHaveLength(1);
    expect(beforeStart[0]).toMatchObject({
      metadata: { id: "agent", depth: 0, isRoot: true },
    });
  });

  it("skips handlers for unknown events", () => {
    const loader = new HooksLoaderService();
    const bus = new HookBus();

    loader.attachObjectHooks(bus, {
      beforeAgentStart: () => undefined,
      // @ts-expect-error ensure invalid events are ignored gracefully
      customEvent: () => undefined,
    });

    expect(bus.listenerCount("beforeAgentStart")).toBe(1);
    expect(bus.eventNames()).not.toContain("customEvent");
  });
});

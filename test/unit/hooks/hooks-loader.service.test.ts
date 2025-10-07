import "reflect-metadata";
import { describe, it, expect, vi } from "vitest";
import { HOOK_EVENTS, HookBus, HooksLoaderService } from "../../../src/hooks";

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
      [HOOK_EVENTS.beforeAgentStart]: (payload) => {
        beforeStart.push(payload);
      },
    });

    await bus.emitAsync(HOOK_EVENTS.beforeAgentStart, lifecyclePayload);

    expect(beforeStart).toHaveLength(1);
    expect(beforeStart[0]).toMatchObject({
      metadata: { id: "agent", depth: 0, isRoot: true },
    });
  });

  it("skips handlers for unknown events", () => {
    const loader = new HooksLoaderService();
    const bus = new HookBus();

    loader.attachObjectHooks(bus, {
      [HOOK_EVENTS.beforeAgentStart]: () => undefined,
      // @ts-expect-error ensure invalid events are ignored gracefully
      customEvent: () => undefined,
    });

    expect(bus.listenerCount(HOOK_EVENTS.beforeAgentStart)).toBe(1);
    expect(bus.eventNames()).not.toContain("customEvent");
  });

  it("translates legacy PascalCase events and warns", async () => {
    const loader = new HooksLoaderService();
    const bus = new HookBus();
    const calls: unknown[] = [];
    const warnSpy = vi.spyOn((loader as any).logger, "warn");

    loader.attachObjectHooks(bus, {
      // legacy casing
      SessionStart: (payload) => {
        calls.push(payload);
      },
    });

    await bus.emitAsync(HOOK_EVENTS.sessionStart, {
      metadata: lifecyclePayload.metadata,
      config: {} as any,
      options: {} as any,
    });

    expect(calls).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("SessionStart")
    );
    warnSpy.mockRestore();
  });
});

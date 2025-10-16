import { HookBus, blockHook } from "@eddie/hooks";
import { HOOK_EVENTS } from '@eddie/types';
import { describe, expect, it, vi } from "vitest";

describe("HookBus", () => {
  it("returns listener results in registration order", async () => {
    const bus = new HookBus();

    bus.on(HOOK_EVENTS.beforeContextPack, () => "first");
    bus.on(HOOK_EVENTS.beforeContextPack, async () => "second");

    const result = await bus.emitAsync(HOOK_EVENTS.beforeContextPack, {
      config: {} as any,
      options: {} as any,
    });

    expect(result.results).toEqual(["first", "second"]);
    expect(result.blocked).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it("short-circuits when a listener vetoes execution", async () => {
    const bus = new HookBus();
    const observed: HookBlockResponse[] = [];

    bus.on(HOOK_EVENTS.beforeModelCall, () => blockHook("not allowed"));
    bus.on(HOOK_EVENTS.beforeModelCall, () => {
      throw new Error("should not run");
    });

    const result = await bus.emitAsync(HOOK_EVENTS.beforeModelCall, {
      metadata: { id: "agent", parentId: undefined, depth: 0, isRoot: true, systemPrompt: "", tools: [] },
      prompt: "prompt",
      context: { totalBytes: 0, fileCount: 0 },
      historyLength: 0,
      iteration: 1,
      messages: [],
    } as any);

    if (result.blocked) {
      observed.push(result.blocked);
    }

    expect(result.results).toHaveLength(1);
    expect(result.blocked?.reason).toBe("not allowed");
    expect(result.error).toBeUndefined();
    expect(observed).toHaveLength(1);
  });

  it("captures the error from the first failing listener", async () => {
    const bus = new HookBus();
    const calls: string[] = [];

    bus.on(HOOK_EVENTS.stop, () => {
      calls.push("first");
      throw new Error("boom");
    });
    bus.on(HOOK_EVENTS.stop, () => {
      calls.push("second");
      return undefined;
    });

    const result = await bus.emitAsync(HOOK_EVENTS.stop, {
      metadata: { id: "agent", parentId: undefined, depth: 0, isRoot: true, systemPrompt: "", tools: [] },
      prompt: "",
      context: { totalBytes: 0, fileCount: 0 },
      historyLength: 0,
      iteration: 1,
      messages: [],
    } as any);

    expect(result.results).toHaveLength(0);
    expect(result.error).toBeInstanceOf(Error);
    expect(calls).toEqual(["first"]);
  });

  it("supports more than ten listeners without warnings", async () => {
    const bus = new HookBus();
    const warningSpy = vi.spyOn(process, "emitWarning");

    const events: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      bus.on(HOOK_EVENTS.beforeContextPack, () => {
        events.push(i);
      });
    }

    await bus.emitAsync(HOOK_EVENTS.beforeContextPack, {
      config: {} as any,
      options: {} as any,
    });

    expect(events).toHaveLength(11);
    expect(warningSpy).not.toHaveBeenCalled();
    warningSpy.mockRestore();
  });
});

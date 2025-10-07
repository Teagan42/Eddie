import { describe, it, expect } from "vitest";
import { HookBus, blockHook } from "../../../src/hooks";
import type { HookBlockResponse } from "../../../src/hooks";

describe("HookBus", () => {
  it("returns listener results in registration order", async () => {
    const bus = new HookBus();

    bus.on("beforeContextPack", () => "first");
    bus.on("beforeContextPack", async () => "second");

    const result = await bus.emitAsync("beforeContextPack", {
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

    bus.on("beforeModelCall", () => blockHook("not allowed"));
    bus.on("beforeModelCall", () => {
      throw new Error("should not run");
    });

    const result = await bus.emitAsync("beforeModelCall", {
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

    bus.on("Stop", () => {
      calls.push("first");
      throw new Error("boom");
    });
    bus.on("Stop", () => {
      calls.push("second");
      return undefined;
    });

    const result = await bus.emitAsync("Stop", {
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
});

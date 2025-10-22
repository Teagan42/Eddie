import { describe, expect, it } from "vitest";

/**
 * These tests ensure the package entry can be imported without building the package first.
 */
describe("@eddie/ui package entry", () => {
  it("exposes the Panel component from the source entry point", async () => {
    const mod = await import("@eddie/ui");

    expect(mod.Panel).toBeTypeOf("function");
  });
});

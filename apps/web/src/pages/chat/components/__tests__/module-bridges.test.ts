import { describe, expect, it } from "vitest";

describe("chat page component bridges", () => {
  it("provides the session selector contract", async () => {
    const module = await import("../SessionSelector");

    expect(module.SESSION_TABLIST_ARIA_LABEL).toBeDefined();
    expect(module.SessionSelector).toBeTypeOf("function");
  });

  it("re-exports the collapsible panel bindings", async () => {
    const module = await import("../CollapsiblePanel");

    expect(module.CollapsiblePanel).toBeTypeOf("function");
  });
});

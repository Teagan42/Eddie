import { describe, expect, it } from "vitest";

// These imports are resolved using the Vite alias configuration.
describe("shiki transformers alias", () => {
  it("exposes diff, focus, and highlight transformers", async () => {
    const module = await import("@shikijs/transformers");

    expect(module.transformerNotationDiff).toBeTypeOf("function");
    expect(module.transformerNotationFocus).toBeTypeOf("function");
    expect(module.transformerNotationHighlight).toBeTypeOf("function");
  });
});

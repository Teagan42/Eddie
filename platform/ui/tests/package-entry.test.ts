import { describe, expect, it } from "vitest";

/**
 * These tests ensure the package entry can be imported without building the package first.
 */
describe("@eddie/ui package entry", () => {
  it("exposes the Panel component from the source entry point", async () => {
    const mod = await import("@eddie/ui");

    expect(mod.Panel).toBeTypeOf("function");
  });

  it("surfaces EddieThemeProvider and the theme tokens path", async () => {
    const mod = await import("@eddie/ui");

    expect(mod.EddieThemeProvider).toBeTypeOf("function");
    expect(mod.THEME_TOKENS_CSS_PATH).toBe("@eddie/ui/theme/tokens.css");
  });
});

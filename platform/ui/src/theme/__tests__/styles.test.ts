import { describe, expect, it } from "vitest";

import { readCss } from "../../__tests__/read-css";

describe("shared styles", () => {
  it("exposes the hero gradient tokens for reuse", () => {
    const css = readCss("../styles.css", import.meta.url);
    expect(css).toContain("--hero-surface-from");
    expect(css).toContain("--hero-cta-from");
  });
});

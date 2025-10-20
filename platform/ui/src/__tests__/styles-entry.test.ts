import { describe, expect, it } from "vitest";

import { readCss } from "./read-css";

describe("styles entry point", () => {
  it("links the theme stylesheet", () => {
    const css = readCss("../styles.css", import.meta.url);
    expect(css).toContain("@import \"./theme/styles.css\"");
  });
});

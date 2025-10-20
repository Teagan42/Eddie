import { describe, expect, it } from "vitest";

import { readCss } from "./read-css";

describe("shared styles linkage", () => {
  it("imports the UI package stylesheet", () => {
    const css = readCss("../global.css", import.meta.url);
    expect(css).toContain("@import \"@eddie/ui/styles.css\"");
  });
});

import { describe, expect, it } from "vitest";

import { formatThemeLabel } from "../../src/overview";

describe("formatThemeLabel", () => {
  it("title cases hyphenated ids when metadata is missing", () => {
    const label = formatThemeLabel("custom-night", []);

    expect(label).toBe("Custom Night");
  });
});

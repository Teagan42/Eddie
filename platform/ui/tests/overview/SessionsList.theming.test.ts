import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("sessions list theming", () => {
  it("uses overview panel variables for the list surface and items", () => {
    const source = readFileSync(
      resolve(__dirname, "../../src/overview/SessionsList.tsx"),
      "utf8",
    );

    expect(source).toContain('border-[color:var(--overview-panel-border)]');
    expect(source).toContain('bg-[color:var(--overview-panel-bg)]');
    expect(source).toContain('border-[color:var(--overview-panel-item-border)]');
    expect(source).toContain('bg-[color:var(--overview-panel-item-bg)]');
  });
});

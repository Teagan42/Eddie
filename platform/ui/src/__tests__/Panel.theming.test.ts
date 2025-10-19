import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("panel cinematic theming", () => {
  it("uses overview surface variables for borders, background, and shadow", () => {
    const source = readFileSync(resolve(__dirname, "../common/Panel.tsx"), "utf8");

    expect(source).toContain('border-[color:var(--overview-panel-border)]');
    expect(source).toContain('bg-[color:var(--overview-panel-bg)]');
    expect(source).toContain('shadow-[var(--overview-panel-shadow)]');
  });
});

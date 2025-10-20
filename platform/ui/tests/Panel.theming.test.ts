import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readPanelSource(): string {
  return readFileSync(resolve(__dirname, "./../src/common/Panel.tsx"), "utf8");
}

describe("panel cinematic theming", () => {
  it("uses hero surface gradient tokens for the panel surface", () => {
    const source = readPanelSource();

    expect(source).toContain('rounded-[2.75rem] border bg-card bg-gradient-to-br p-10 text-foreground');
    expect(source).toContain('from-[hsl(var(--hero-surface-from))] via-[hsl(var(--hero-surface-via))] to-[hsl(var(--hero-surface-to))]');
    expect(source).toContain('shadow-[var(--hero-surface-shadow)] border-border/60');
  });

  it("applies midnight surface and badge styles", () => {
    const source = readPanelSource();

    expect(source).toContain('dark:from-[hsl(var(--hero-surface-from-dark))] dark:via-[hsl(var(--hero-surface-via-dark))] dark:to-[hsl(var(--hero-surface-to-dark))]');
    expect(source).toContain('dark:shadow-[var(--hero-surface-shadow-dark)]');
    expect(source).toContain('dark:bg-[color:var(--hero-badge-bg-dark)]');
    expect(source).toContain('dark:text-[color:var(--hero-badge-fg-dark)]');
  });
});

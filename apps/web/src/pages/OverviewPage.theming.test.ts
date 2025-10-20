import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("overview page runtime config theming", () => {
  it("styles the runtime config select with midnight cta tokens", () => {
    const source = readFileSync(resolve(__dirname, "./OverviewPage.tsx"), "utf8");

    expect(source).toContain('title="Runtime Config"');
    expect(source).toContain('bg-gradient-to-r');
    expect(source).toContain('from-[hsl(var(--hero-cta-from))]');
    expect(source).toContain('via-[hsl(var(--hero-cta-via))]');
    expect(source).toContain('to-[hsl(var(--hero-cta-to))]');
    expect(source).toContain('text-[color:var(--hero-cta-foreground)]');
    expect(source).toContain('shadow-[var(--hero-cta-shadow)]');
    expect(source).toContain('dark:from-[hsl(var(--hero-cta-from-dark))]');
    expect(source).toContain('dark:via-[hsl(var(--hero-cta-via-dark))]');
    expect(source).toContain('dark:to-[hsl(var(--hero-cta-to-dark))]');
    expect(source).toContain('dark:text-[color:var(--hero-cta-foreground-dark)]');
    expect(source).toContain('dark:shadow-[var(--hero-cta-shadow-dark)]');
  });
});

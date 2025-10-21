import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("overview stats grid theming", () => {
  it("uses midnight stat surface tokens", () => {
    const source = readFileSync(
      resolve(__dirname, "../../src/overview/OverviewStatsGrid.tsx"),
      "utf8",
    );

    expect(source).toContain('bg-[color:var(--overview-stat-card-bg)]');
    expect(source).toContain('border-[color:var(--overview-stat-card-border)]');
    expect(source).toContain('shadow-[var(--overview-stat-card-shadow)]');
    expect(source).toContain('dark:bg-[color:var(--overview-stat-card-bg-dark)]');
    expect(source).toContain('dark:shadow-[var(--overview-stat-card-shadow-dark)]');
  });
});

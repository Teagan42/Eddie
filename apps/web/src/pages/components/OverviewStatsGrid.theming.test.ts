import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const OVERVIEW_STATS_GRID_SOURCE_PATH = resolve(
  __dirname,
  "../../../../../platform/ui/src/overview/OverviewStatsGrid.tsx",
);

describe("overview stats grid theming", () => {
  it("applies midnight console icon backgrounds", () => {
    const source = readFileSync(OVERVIEW_STATS_GRID_SOURCE_PATH, "utf8");

    expect(source).toContain('bg-[color:var(--hero-console-icon-bg)]');
    expect(source).toContain('dark:bg-[color:var(--hero-console-icon-bg-dark)]');
  });
});

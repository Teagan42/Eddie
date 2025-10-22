import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("overview auth panel theming", () => {
  it("uses midnight badge tokens", () => {
    const source = readFileSync(
      resolve(__dirname, "../../src/overview/OverviewAuthPanel.tsx"),
      "utf8",
    );

    expect(source).toContain('Secure & Local Only');
    expect(source).toContain('dark:bg-[color:var(--hero-badge-bg-dark)]');
    expect(source).toContain('dark:text-[color:var(--hero-badge-fg-dark)]');
  });
});

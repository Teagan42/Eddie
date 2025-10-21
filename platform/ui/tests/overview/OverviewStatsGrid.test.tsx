import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OverviewStatsGrid, type OverviewStat } from "../../src/overview";

function DummyIcon({ className }: { className?: string }): JSX.Element {
  return <svg data-testid="overview-stat-icon" className={className} />;
}

describe("OverviewStatsGrid", () => {
  const stats: OverviewStat[] = [
    {
      label: "Active Sessions",
      value: 42,
      hint: "Collaboration threads in motion",
      icon: DummyIcon,
    },
    {
      label: "Live Traces",
      value: 9,
      hint: "Streaming observability signals",
      icon: DummyIcon,
    },
  ];

  it("renders stat cards with icons and metadata", () => {
    render(<OverviewStatsGrid stats={stats} />);

    for (const stat of stats) {
      const testId = `overview-stat-${stat.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
      const card = screen.getByTestId(testId);
      expect(card).toHaveTextContent(String(stat.value));
      expect(card).toHaveTextContent(stat.label);
      if (stat.hint) {
        expect(card).toHaveTextContent(stat.hint);
      }
    }

    const icons = screen.getAllByTestId("overview-stat-icon");
    expect(icons).toHaveLength(stats.length);
    for (const icon of icons) {
      const className = icon.getAttribute("class") ?? "";
      expect(className).toContain("h-6");
      expect(className).toContain("w-6");
    }
  });
});

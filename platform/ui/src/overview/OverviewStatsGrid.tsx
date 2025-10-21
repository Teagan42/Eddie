import type { JSX } from "react";

export interface OverviewStat {
  readonly label: string;
  readonly value: number;
}

export interface OverviewStatsGridProps {
  readonly stats: readonly OverviewStat[];
}

export function OverviewStatsGrid(_props: OverviewStatsGridProps): JSX.Element | null {
  return null;
}

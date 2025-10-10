import { useMemo } from "react";
import { ArrowUpRight, Sparkles, Waves } from "lucide-react";
import type { OverviewStat } from "../components/OverviewStatsGrid";

interface UseOverviewStatsOptions {
  sessionCount?: number;
  traceCount?: number;
  logCount?: number;
}

export function useOverviewStats({
  sessionCount = 0,
  traceCount = 0,
  logCount = 0,
}: UseOverviewStatsOptions): OverviewStat[] {
  return useMemo(
    () => [
      {
        label: "Active Sessions",
        value: sessionCount,
        hint: "Collaboration threads in motion",
        icon: Sparkles,
      },
      {
        label: "Live Traces",
        value: traceCount,
        hint: "Streaming observability signals",
        icon: Waves,
      },
      {
        label: "Log Entries",
        value: logCount,
        hint: "Latest structured telemetry",
        icon: ArrowUpRight,
      },
    ],
    [logCount, sessionCount, traceCount]
  );
}

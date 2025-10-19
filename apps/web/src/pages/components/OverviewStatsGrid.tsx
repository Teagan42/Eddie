import { Badge, Box, Flex, Grid, Heading, Text } from "@radix-ui/themes";
import type { ComponentType } from "react";
import { cn } from "@/vendor/lib/utils";

export interface OverviewStat {
  label: string;
  value: number;
  hint: string;
  icon: ComponentType<{ className?: string }>;
}

interface OverviewStatsGridProps {
  stats?: OverviewStat[];
}

export function OverviewStatsGrid({ stats = [] }: OverviewStatsGridProps): JSX.Element {
  return (
    <Grid columns={{ initial: "1", sm: "3" }} gap="4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Box
            key={stat.label}
            className={cn(
              "group relative overflow-hidden rounded-3xl border p-6",
              "border-[color:var(--overview-stat-card-border)]",
              "bg-[color:var(--overview-stat-card-bg)]",
              "shadow-[var(--overview-stat-card-shadow)]"
            )}
          >
            <div
              className={cn(
                "absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100",
                "[background:var(--overview-stat-card-overlay)]"
              )}
            />
            <Flex align="center" justify="between" className="mb-3">
              <Flex align="center" gap="3">
                <span
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-2xl",
                    "bg-[color:var(--overview-stat-icon-bg)]",
                    "bg-[color:var(--hero-console-icon-bg)]",
                    "dark:bg-[color:var(--hero-console-icon-bg-dark)]"
                  )}
                >
                  <Icon className="h-5 w-5 text-[color:var(--overview-stat-icon-fg)]" />
                </span>
                <Text
                  size="1"
                  className={cn(
                    "uppercase tracking-[0.3em]",
                    "text-[color:var(--overview-stat-hint)]"
                  )}
                >
                  {stat.label}
                </Text>
              </Flex>
              <Badge variant="soft" color="grass">
                Live
              </Badge>
            </Flex>
            <Heading size="7" className="text-[color:var(--overview-stat-value)]">
              {stat.value}
            </Heading>
            <Text size="2" className="text-[color:var(--overview-stat-hint)]">
              {stat.hint}
            </Text>
          </Box>
        );
      })}
    </Grid>
  );
}

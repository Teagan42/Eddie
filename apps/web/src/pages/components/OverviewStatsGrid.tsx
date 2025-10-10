import { Badge, Box, Flex, Grid, Heading, Text } from "@radix-ui/themes";
import type { ComponentType } from "react";

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
            className="group relative overflow-hidden rounded-3xl border border-white/15 bg-white/12 p-6 shadow-[0_35px_70px_-55px_rgba(56,189,248,0.75)]"
          >
            <div className="absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100 [background:radial-gradient(circle_at_top,_rgba(74,222,128,0.25),transparent_65%)]" />
            <Flex align="center" justify="between" className="mb-3">
              <Flex align="center" gap="3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900/50">
                  <Icon className="h-5 w-5 text-emerald-200" />
                </span>
                <Text size="1" color="gray" className="uppercase tracking-[0.3em]">
                  {stat.label}
                </Text>
              </Flex>
              <Badge variant="soft" color="grass">
                Live
              </Badge>
            </Flex>
            <Heading size="7" className="text-white">
              {stat.value}
            </Heading>
            <Text size="2" color="gray">
              {stat.hint}
            </Text>
          </Box>
        );
      })}
    </Grid>
  );
}

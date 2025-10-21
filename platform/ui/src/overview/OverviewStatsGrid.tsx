import { Badge, Box, Flex, Grid, Heading, Text } from "@radix-ui/themes";
import type { JSX } from "react";

import { combineClassNames } from "../utils/class-names";
import type { OverviewStat, OverviewStatsGridProps } from "./types";

export type { OverviewStat, OverviewStatsGridProps } from "./types";

const CARD_CLASS = combineClassNames(
  "group relative overflow-hidden rounded-3xl border p-6",
  "border-[color:var(--overview-stat-card-border)]",
  "bg-[color:var(--overview-stat-card-bg)]",
  "shadow-[var(--overview-stat-card-shadow)]",
  "dark:bg-[color:var(--overview-stat-card-bg-dark)]",
  "dark:shadow-[var(--overview-stat-card-shadow-dark)]",
);

const CARD_OVERLAY_CLASS = combineClassNames(
  "absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100",
  "[background:var(--overview-stat-card-overlay)]",
);

const ICON_WRAPPER_CLASS = combineClassNames(
  "flex h-12 w-12 items-center justify-center rounded-2xl",
  "bg-[color:var(--hero-console-icon-bg)]",
  "dark:bg-[color:var(--hero-console-icon-bg-dark)]",
);

const ICON_CLASS = combineClassNames(
  "h-6 w-6",
  "text-[color:var(--hero-console-icon-fg)]",
  "dark:text-[color:var(--hero-console-icon-fg-dark)]",
);

const LABEL_CLASS = combineClassNames(
  "uppercase tracking-[0.3em]",
  "text-[color:var(--overview-stat-hint)]",
);

const BADGE_CLASS = combineClassNames(
  "bg-[color:var(--hero-badge-bg)]",
  "text-[color:var(--hero-badge-fg)]",
  "dark:bg-[color:var(--hero-badge-bg-dark)]",
  "dark:text-[color:var(--hero-badge-fg-dark)]",
);

const VALUE_CLASS = "text-[color:var(--overview-stat-value)]";
const HINT_CLASS = "text-[color:var(--overview-stat-hint)]";

function getStatTestId(label: OverviewStat["label"]): string {
  return `overview-stat-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

export function OverviewStatsGrid({ stats = [] }: OverviewStatsGridProps = {}): JSX.Element {
  return (
    <Grid columns={{ initial: "1", sm: "3" }} gap="4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        const testId = getStatTestId(stat.label);

        return (
          <Box key={stat.label} className={CARD_CLASS} data-testid={testId}>
            <div className={CARD_OVERLAY_CLASS} />
            <Flex align="center" justify="between" className="mb-3">
              <Flex align="center" gap="3">
                <span className={ICON_WRAPPER_CLASS}>
                  <Icon className={ICON_CLASS} data-testid="overview-stat-icon" />
                </span>
                <Text size="1" className={LABEL_CLASS}>
                  {stat.label}
                </Text>
              </Flex>
              <Badge variant="soft" className={BADGE_CLASS}>
                Live
              </Badge>
            </Flex>
            <Heading size="7" className={VALUE_CLASS}>
              {stat.value}
            </Heading>
            {stat.hint ? (
              <Text size="2" className={HINT_CLASS}>
                {stat.hint}
              </Text>
            ) : null}
          </Box>
        );
      })}
    </Grid>
  );
}

import "../../src/overview/types";
import { describe, expectTypeOf, it } from "vitest";
import type { ComponentType } from "react";

import type {
  OverviewAuthPanelProps,
  OverviewHeroProps,
  OverviewStat,
  OverviewStatsGridProps,
  OverviewTheme,
  SessionItem,
  SessionsListProps,
} from "../../src/overview/types";
import type {
  OverviewAuthPanelProps as OverviewAuthPanelPropsFromIndex,
  OverviewHeroProps as OverviewHeroPropsFromIndex,
  OverviewStat as OverviewStatFromIndex,
  OverviewStatsGridProps as OverviewStatsGridPropsFromIndex,
  OverviewTheme as OverviewThemeFromIndex,
  SessionItem as SessionItemFromIndex,
  SessionsListProps as SessionsListPropsFromIndex,
} from "../../src/overview";

describe("overview type exports", () => {
  it("defines overview stat contract locally", () => {
    expectTypeOf<OverviewStat>().not.toBeAny();
    expectTypeOf<OverviewStat>().toMatchTypeOf<{
      readonly label: string;
      readonly value: number;
      readonly hint?: string;
      readonly icon: ComponentType<{ readonly className?: string }>;
    }>();
  });

  it("defines overview theme metadata locally", () => {
    expectTypeOf<OverviewTheme>().not.toBeAny();
    expectTypeOf<OverviewTheme>().toMatchTypeOf<{
      readonly id: string;
      readonly name: string;
      readonly description?: string;
      readonly previewUrl?: string;
    }>();
  });

  it("describes overview stats grid contract", () => {
    expectTypeOf<OverviewStatsGridProps>().not.toBeAny();
    expectTypeOf<OverviewStatsGridProps>().toMatchTypeOf<{
      readonly stats?: readonly OverviewStat[];
    }>();
  });

  it("provides session list contracts", () => {
    expectTypeOf<SessionsListProps>().not.toBeAny();
    expectTypeOf<SessionsListProps>().toMatchTypeOf<{
      readonly sessions: readonly SessionItem[];
    }>();
    expectTypeOf<SessionItem>().not.toBeAny();
    expectTypeOf<SessionItem>().toMatchTypeOf<{
      readonly id: string;
      readonly title: string;
    }>();
  });

  it("includes hero and auth panel prop contracts", () => {
    expectTypeOf<OverviewHeroProps>().not.toBeAny();
    expectTypeOf<OverviewHeroProps>().toMatchTypeOf<{
      readonly apiKey?: string | null;
      readonly apiUrl?: string | null;
    }>();
    expectTypeOf<OverviewAuthPanelProps>().not.toBeAny();
    expectTypeOf<OverviewAuthPanelProps>().toMatchTypeOf<{
      readonly apiKey?: string | null;
      readonly onApiKeyChange?: (value: string) => void;
    }>();
  });

  it("re-exports overview types from the barrel", () => {
    expectTypeOf<OverviewStatFromIndex>().toEqualTypeOf<OverviewStat>();
    expectTypeOf<OverviewStatsGridPropsFromIndex>().toEqualTypeOf<OverviewStatsGridProps>();
    expectTypeOf<OverviewThemeFromIndex>().toEqualTypeOf<OverviewTheme>();
    expectTypeOf<SessionsListPropsFromIndex>().toEqualTypeOf<SessionsListProps>();
    expectTypeOf<SessionItemFromIndex>().toEqualTypeOf<SessionItem>();
    expectTypeOf<OverviewHeroPropsFromIndex>().toEqualTypeOf<OverviewHeroProps>();
    expectTypeOf<OverviewAuthPanelPropsFromIndex>().toEqualTypeOf<OverviewAuthPanelProps>();
  });
});

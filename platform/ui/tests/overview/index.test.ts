import { describe, expect, expectTypeOf, it } from "vitest";

import {
  AVAILABLE_THEMES,
  OverviewAuthPanel,
  OverviewHero,
  OverviewStatsGrid,
  SessionsList,
  ThemeProvider,
  isDarkTheme,
  useTheme,
} from "../../src/overview";
import type { SessionsListProps } from "../../src/overview";

describe("overview barrel", () => {
  it("exposes overview page primitives", () => {
    expect(typeof OverviewAuthPanel).toBe("function");
    expect(typeof OverviewHero).toBe("function");
    expect(typeof OverviewStatsGrid).toBe("function");
    expect(typeof SessionsList).toBe("function");
  });

  it("re-exports theme helpers for overview consumers", () => {
    expect(Array.isArray(AVAILABLE_THEMES)).toBe(true);
    expect(typeof ThemeProvider).toBe("function");
    expect(typeof useTheme).toBe("function");
    expect(typeof isDarkTheme).toBe("function");
  });

  it("exposes the sessions list prop contract", () => {
    expectTypeOf<SessionsListProps>().toMatchTypeOf<object>();
  });
});

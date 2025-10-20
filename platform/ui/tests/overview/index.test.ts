import { describe, expect, it } from "vitest";

import {
  OverviewAuthPanel,
  OverviewHero,
  OverviewPage,
  OverviewStatsGrid,
  SessionsList,
} from "../../src/overview";

describe("overview barrel", () => {
  it("exposes overview page primitives", () => {
    expect(typeof OverviewAuthPanel).toBe("function");
    expect(typeof OverviewHero).toBe("function");
    expect(typeof OverviewPage).toBe("function");
    expect(typeof OverviewStatsGrid).toBe("function");
    expect(typeof SessionsList).toBe("function");
  });
});

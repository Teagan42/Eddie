import { describe, it, expect } from "vitest";
import {
  ChatSessionsPanel,
  MessageComposer,
  OverviewAuthPanel,
  OverviewHero,
  OverviewStatsGrid,
  SessionDetail,
  SessionsList,
} from ".";

describe("pages components barrel", () => {
  it("exposes reusable page building blocks", () => {
    expect(typeof ChatSessionsPanel).toBe("function");
    expect(typeof MessageComposer).toBe("function");
    expect(typeof OverviewAuthPanel).toBe("function");
    expect(typeof OverviewHero).toBe("function");
    expect(typeof OverviewStatsGrid).toBe("function");
    expect(typeof SessionDetail).toBe("function");
    expect(typeof SessionsList).toBe("function");
  });
});

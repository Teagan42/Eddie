import { describe, it, expect } from "vitest";
import { useChatSessionEvents, useOverviewStats } from ".";

describe("pages hooks barrel", () => {
  it("exposes overview data helpers", () => {
    expect(typeof useChatSessionEvents).toBe("function");
    expect(typeof useOverviewStats).toBe("function");
  });
});

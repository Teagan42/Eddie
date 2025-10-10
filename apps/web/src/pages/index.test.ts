import { describe, it, expect } from "vitest";
import { App, ChatPage, ConfigPage, OverviewPage } from ".";

describe("pages barrel", () => {
  it("exposes primary application routes", () => {
    expect(typeof App).toBe("function");
    expect(typeof OverviewPage).toBe("function");
    expect(typeof ChatPage).toBe("function");
    expect(typeof ConfigPage).toBe("function");
  });
});

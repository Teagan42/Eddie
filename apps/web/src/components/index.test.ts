import { describe, expect, it } from "vitest";

import {
  AppHeader,
  AuroraBackground,
  NavigationLink,
  Panel,
} from "./index";

describe("components barrel", () => {
  it("exposes common layout and navigation elements", () => {
    expect(typeof Panel).toBe("function");
    expect(typeof AuroraBackground).toBe("function");
    expect(typeof AppHeader).toBe("function");
    expect(typeof NavigationLink).toBe("function");
  });
});

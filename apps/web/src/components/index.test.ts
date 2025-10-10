import { describe, expect, it } from "vitest";

import * as components from "./index";
import * as common from "./common";
import * as layout from "./layout";
import * as navigation from "./navigation";

describe("components barrel", () => {
  it("exposes grouped layout, navigation, and common primitives", () => {
    expect(typeof common.Panel).toBe("function");
    expect(typeof common.AuroraBackground).toBe("function");
    expect(typeof layout.AppHeader).toBe("function");
    expect(typeof navigation.NavigationLink).toBe("function");
  });

  it("re-exports grouped primitives from the root barrel", () => {
    expect(components.Panel).toBe(common.Panel);
    expect(components.AuroraBackground).toBe(common.AuroraBackground);
    expect(components.AppHeader).toBe(layout.AppHeader);
    expect(components.NavigationLink).toBe(navigation.NavigationLink);
  });
});

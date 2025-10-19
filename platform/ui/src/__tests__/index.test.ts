import { describe, expect, it } from "vitest";

import * as ui from "..";

import * as common from "../common";
import * as layout from "../layout";
import * as navigation from "../navigation";

describe("@eddie/ui exports", () => {
  it("exposes grouped layout, navigation, and common primitives", () => {
    expect(typeof common.Panel).toBe("function");
    expect(typeof common.AuroraBackground).toBe("function");
    expect(typeof common.JsonTreeView).toBe("function");
    expect(typeof layout.AppHeader).toBe("function");
    expect(typeof navigation.NavigationLink).toBe("function");
  });

  it("re-exports grouped primitives from the root barrel", () => {
    expect(ui.Panel).toBe(common.Panel);
    expect(ui.AuroraBackground).toBe(common.AuroraBackground);
    expect(ui.JsonTreeView).toBe(common.JsonTreeView);
    expect(ui.AppHeader).toBe(layout.AppHeader);
    expect(ui.NavigationLink).toBe(navigation.NavigationLink);
  });
});

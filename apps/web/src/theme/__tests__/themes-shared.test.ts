import { describe, expect, it } from "vitest";

import {
  AVAILABLE_THEMES as appThemes,
  getThemeAccentColor as appAccent,
  getThemeAppearance as appAppearance,
} from "@/theme/themes";
import {
  AVAILABLE_THEMES as sharedThemes,
  getThemeAccentColor as sharedAccent,
  getThemeAppearance as sharedAppearance,
} from "@eddie/ui";

describe("shared theme exports", () => {
  it("re-exports helpers from the UI package", () => {
    expect(appThemes).toBe(sharedThemes);
    expect(appAccent).toBe(sharedAccent);
    expect(appAppearance).toBe(sharedAppearance);
  });
});

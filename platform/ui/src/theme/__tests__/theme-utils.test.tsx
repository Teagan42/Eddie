import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  EddieThemeProvider,
  getThemeAccentColor,
  getThemeAppearance,
  isDarkTheme,
  resolveThemeTokens,
} from "..";

describe("theme utilities", () => {
  it("maps theme names to accent colors", () => {
    expect(getThemeAccentColor("light")).toBe("jade");
    expect(getThemeAccentColor("midnight")).toBe("iris");
    expect(getThemeAccentColor("aurora")).toBe("amber");
  });

  it("derives appearance and darkness from theme", () => {
    expect(getThemeAppearance("light")).toBe("light");
    expect(getThemeAppearance("midnight")).toBe("dark");
    expect(isDarkTheme("midnight")).toBe(true);
    expect(isDarkTheme("aurora")).toBe(false);
  });

  it("provides combined tokens including darkness metadata", () => {
    expect(resolveThemeTokens("midnight")).toEqual({
      accentColor: "iris",
      appearance: "dark",
      isDark: true,
    });

    expect(resolveThemeTokens("aurora")).toEqual({
      accentColor: "amber",
      appearance: "light",
      isDark: false,
    });
  });
});

describe("EddieThemeProvider", () => {
  it("sets Radix accent and appearance based on the runtime theme", () => {
    const { container, rerender } = render(
      <EddieThemeProvider theme="midnight">content</EddieThemeProvider>
    );

    const root = container.querySelector('[data-is-root-theme="true"]');
    expect(root?.getAttribute("data-accent-color")).toBe("iris");
    expect(root?.classList.contains("dark")).toBe(true);

    rerender(<EddieThemeProvider theme="aurora">content</EddieThemeProvider>);

    expect(root?.getAttribute("data-accent-color")).toBe("amber");
    expect(root?.classList.contains("dark")).toBe(false);
  });
});

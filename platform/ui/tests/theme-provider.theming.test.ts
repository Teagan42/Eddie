import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { EddieThemeProvider } from "../src/theme/EddieThemeProvider";
import { AVAILABLE_THEMES } from "../src/theme/themes";

type ThemeName = (typeof AVAILABLE_THEMES)[number];

type TokenCategory = "cta" | "badge" | "surface" | "console";

function extractThemeBlock(cssText: string, theme: ThemeName): string {
  const pattern = new RegExp(`:root\\[data-theme="${theme}"\\]\\s*{([\\s\\S]*?)}`, "m");
  const match = pattern.exec(cssText);

  if (!match) {
    throw new Error(`No CSS block found for theme: ${theme}`);
  }

  return match[1];
}

function renderThemeTokens(): string {
  const { container } = render(
    createElement(EddieThemeProvider, null, createElement("div", { "data-testid": "content" })),
  );

  const styleElement = container.querySelector("style[data-eddie-theme]");

  if (!styleElement) {
    throw new Error("Expected EddieThemeProvider to inject a style[data-eddie-theme] element");
  }

  return styleElement.textContent ?? "";
}

describe("EddieThemeProvider theming", () => {
  it("injects CSS tokens for every available theme", () => {
    const cssText = renderThemeTokens();

    AVAILABLE_THEMES.forEach((theme) => {
      expect(cssText).toContain(`:root[data-theme="${theme}"]`);
    });
  });

  it("exposes CTA, badge, surface, and console variables across themes", () => {
    const cssText = renderThemeTokens();

    const requiredVariables: Record<TokenCategory, readonly string[]> = {
      cta: [
        "--hero-cta-from",
        "--hero-cta-via",
        "--hero-cta-to",
        "--hero-cta-shadow",
        "--hero-cta-foreground",
      ],
      badge: ["--hero-badge-bg", "--hero-badge-fg"],
      surface: [
        "--hero-surface-from",
        "--hero-surface-via",
        "--hero-surface-to",
        "--hero-surface-shadow",
        "--hero-surface-overlay",
        "--hero-surface-lens",
      ],
      console: [
        "--hero-console-overlay",
        "--hero-console-overlay-dark",
        "--hero-console-bg",
        "--hero-console-bg-dark",
        "--hero-console-border",
        "--hero-console-border-dark",
        "--hero-console-icon-bg",
        "--hero-console-icon-bg-dark",
        "--hero-console-icon-fg",
        "--hero-console-icon-fg-dark",
        "--hero-console-separator",
        "--hero-console-separator-dark",
      ],
    };

    AVAILABLE_THEMES.forEach((theme) => {
      const block = extractThemeBlock(cssText, theme);

      (Object.values(requiredVariables).flat() as string[]).forEach((variable) => {
        expect(block).toContain(variable);
      });
    });
  });

  it("packages aurora and midnight overrides in tokens.css", () => {
    const cssFile = readFileSync(resolve(__dirname, "../src/theme/tokens.css"), "utf8");

    expect(cssFile).toContain(':root[data-theme="aurora"]');
    expect(cssFile).toContain(':root[data-theme="midnight"]');
  });
});

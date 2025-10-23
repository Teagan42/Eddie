import type { PropsWithChildren } from "react";

import { TOKENS_CSS } from "./tokens-css";
import { AVAILABLE_THEMES } from "./themes";

type ThemeName = (typeof AVAILABLE_THEMES)[number];

function extractThemeBlock(source: string, theme: ThemeName): string {
  const pattern = new RegExp(`:root\\s*\\[data-theme=\"?${theme}\"?\\]\\s*{[\\s\\S]*?}`, "m");
  const match = source.match(pattern);

  if (!match) {
    throw new Error(`Missing CSS tokens for theme "${theme}"`);
  }

  return match[0].trim();
}

function partitionThemeCss(source: string): { baseCss: string; themeCss: Record<ThemeName, string> } {
  let baseCss = source;

  const themeCss = AVAILABLE_THEMES.reduce<Record<ThemeName, string>>((acc, theme) => {
    const block = extractThemeBlock(source, theme);
    baseCss = baseCss.replace(block, "");
    acc[theme] = block;
    return acc;
  }, {} as Record<ThemeName, string>);

  return { baseCss: baseCss.trim(), themeCss };
}

const { baseCss, themeCss } = partitionThemeCss(TOKENS_CSS);
const themeCssByTheme = Object.freeze(themeCss);

const themeStylesheet = [
  baseCss,
  ...AVAILABLE_THEMES.map((theme) => themeCssByTheme[theme]),
]
  .filter((chunk) => chunk.length > 0)
  .join("\n\n");

export function EddieThemeProvider({ children }: PropsWithChildren<unknown>): JSX.Element {
  return (
    <>
      <style data-eddie-theme="" dangerouslySetInnerHTML={{ __html: themeStylesheet }} />
      {children}
    </>
  );
}

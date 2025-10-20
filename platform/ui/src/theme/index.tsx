import { Theme } from "@radix-ui/themes";
import type { ReactNode } from "react";

export type ThemeName = "light" | "dark" | "midnight" | "aurora";

export type ThemeAccentColor = "amber" | "iris" | "jade";
export type ThemeAppearance = "light" | "dark";

export const AVAILABLE_THEMES = [
  "light",
  "dark",
  "midnight",
  "aurora",
] as const satisfies readonly ThemeName[];

const DARK_THEMES = new Set<ThemeName>(["dark", "midnight"]);

const ACCENT_COLOR_BY_THEME: Record<ThemeName, ThemeAccentColor> = {
  aurora: "amber",
  dark: "jade",
  light: "jade",
  midnight: "iris",
};

export function isDarkTheme(theme: ThemeName): boolean {
  return DARK_THEMES.has(theme);
}

export function getThemeAccentColor(theme: ThemeName): ThemeAccentColor {
  return ACCENT_COLOR_BY_THEME[theme] ?? "jade";
}

export function getThemeAppearance(theme: ThemeName): ThemeAppearance {
  return isDarkTheme(theme) ? "dark" : "light";
}

export function resolveThemeTokens(theme: ThemeName): {
  accentColor: ThemeAccentColor;
  appearance: ThemeAppearance;
  isDark: boolean;
} {
  const appearance = getThemeAppearance(theme);

  return {
    accentColor: getThemeAccentColor(theme),
    appearance,
    isDark: appearance === "dark",
  } as const;
}

export function formatThemeLabel(theme: ThemeName): string {
  return theme.charAt(0).toUpperCase() + theme.slice(1);
}

export function getNextTheme(theme: ThemeName): ThemeName {
  const index = AVAILABLE_THEMES.indexOf(theme);
  if (index === -1) {
    return AVAILABLE_THEMES[0];
  }
  return AVAILABLE_THEMES[(index + 1) % AVAILABLE_THEMES.length];
}

export interface EddieThemeProviderProps {
  theme: ThemeName;
  children: ReactNode;
  radius?: "small" | "medium" | "large" | "full";
}

export function EddieThemeProvider({
  theme,
  children,
  radius = "large",
}: EddieThemeProviderProps): JSX.Element {
  const { accentColor, appearance } = resolveThemeTokens(theme);
  return (
    <Theme
      accentColor={accentColor}
      appearance={appearance}
      radius={radius}
    >
      {children}
    </Theme>
  );
}

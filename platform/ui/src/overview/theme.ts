import type { JSX, ReactNode } from "react";

export const AVAILABLE_THEMES = ["light"] as const;

export type ThemeName = (typeof AVAILABLE_THEMES)[number];

export interface ThemeState {
  readonly theme: ThemeName;
  readonly setTheme: (nextTheme: ThemeName) => void;
  readonly isThemeStale: boolean;
}

export function ThemeProvider({ children }: { readonly children?: ReactNode }): JSX.Element | null {
  return (children as JSX.Element | null) ?? null;
}

export function useTheme(): ThemeState {
  return {
    theme: AVAILABLE_THEMES[0],
    setTheme: () => undefined,
    isThemeStale: false,
  };
}

export function isDarkTheme(theme: string): boolean {
  return theme === "dark";
}

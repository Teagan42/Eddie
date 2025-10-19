import type { RuntimeConfigDto } from "@eddie/api-client";

export const AVAILABLE_THEMES = [
  "light",
  "dark",
  "midnight",
  "aurora",
] as const satisfies readonly RuntimeConfigDto["theme"][];

const DARK_THEMES = new Set<RuntimeConfigDto["theme"]>(["dark", "midnight"]);

export function formatThemeLabel(theme: RuntimeConfigDto["theme"]): string {
  return theme.charAt(0).toUpperCase() + theme.slice(1);
}

export function isDarkTheme(theme: RuntimeConfigDto["theme"]): boolean {
  return DARK_THEMES.has(theme);
}

export function getNextTheme(theme: RuntimeConfigDto["theme"]): RuntimeConfigDto["theme"] {
  const index = AVAILABLE_THEMES.indexOf(theme);
  if (index === -1) {
    return AVAILABLE_THEMES[0];
  }
  return AVAILABLE_THEMES[(index + 1) % AVAILABLE_THEMES.length];
}

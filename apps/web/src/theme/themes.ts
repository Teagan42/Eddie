import type { RuntimeConfigDto } from "@eddie/api-client";
import {
  AVAILABLE_THEMES as SHARED_AVAILABLE_THEMES,
  formatThemeLabel as sharedFormatThemeLabel,
  getNextTheme as sharedGetNextTheme,
  getThemeAccentColor as sharedGetThemeAccentColor,
  getThemeAppearance as sharedGetThemeAppearance,
  isDarkTheme as sharedIsDarkTheme,
  type ThemeAccentColor,
  type ThemeAppearance,
} from "@eddie/ui";

type RuntimeTheme = RuntimeConfigDto["theme"];

export const AVAILABLE_THEMES = SHARED_AVAILABLE_THEMES as readonly RuntimeTheme[];

export const formatThemeLabel: (theme: RuntimeTheme) => string = sharedFormatThemeLabel;

export const isDarkTheme: (theme: RuntimeTheme) => boolean = sharedIsDarkTheme;

export const getNextTheme: (theme: RuntimeTheme) => RuntimeTheme = sharedGetNextTheme;

export const getThemeAccentColor: (theme: RuntimeTheme) => ThemeAccentColor =
  sharedGetThemeAccentColor;

export const getThemeAppearance: (theme: RuntimeTheme) => ThemeAppearance =
  sharedGetThemeAppearance;

export type { ThemeAccentColor };

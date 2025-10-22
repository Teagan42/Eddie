import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Theme } from "@radix-ui/themes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RuntimeConfigDto } from "@eddie/api-client";

import { useOverviewApi, type OverviewConfigApi } from "./api";

export const AVAILABLE_THEMES = ["light", "dark", "midnight", "aurora"] as const;

type ThemeName = (typeof AVAILABLE_THEMES)[number];

const DARK_THEMES = new Set<RuntimeConfigDto["theme"]>(["dark", "midnight"]);

const THEME_ACCENTS = new Map<ThemeName, "amber" | "iris" | "jade">([
  ["aurora", "amber"],
  ["midnight", "iris"],
]);

export function isDarkTheme(theme: RuntimeConfigDto["theme"]): boolean {
  return DARK_THEMES.has(theme);
}

export function formatThemeLabel(theme: RuntimeConfigDto["theme"]): string {
  return theme.charAt(0).toUpperCase() + theme.slice(1);
}

export function getThemeAccentColor(theme: ThemeName): "amber" | "iris" | "jade" {
  return THEME_ACCENTS.get(theme) ?? "jade";
}

export function getThemeAppearance(theme: ThemeName): "light" | "dark" {
  return isDarkTheme(theme) ? "dark" : "light";
}

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  isThemeStale: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const CONFIG_QUERY_KEY = ["config"] as const;
const STALE_REPLAY_WINDOW_MS = 1000;

function coerceTheme(theme?: RuntimeConfigDto["theme"]): ThemeName {
  if (theme && AVAILABLE_THEMES.includes(theme as ThemeName)) {
    return theme as ThemeName;
  }
  return AVAILABLE_THEMES[0];
}

function syncDocumentTheme(theme: ThemeName): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (isDarkTheme(theme)) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const api = useOverviewApi();
  const queryClient = useQueryClient();
  const rawConfigApi = api.http?.config ?? api.config;
  const configApi = useMemo<OverviewConfigApi>(
    () =>
      rawConfigApi ?? {
        async get() {
          return { theme: AVAILABLE_THEMES[0] } as RuntimeConfigDto;
        },
        async update(input) {
          return { theme: coerceTheme(input?.theme) } as RuntimeConfigDto;
        },
      },
    [rawConfigApi],
  );

  const configQuery = useQuery({
    queryKey: CONFIG_QUERY_KEY,
    queryFn: () => configApi.get(),
  });

  const [theme, setThemeState] = useState<ThemeName>(() => coerceTheme(configQuery.data?.theme));
  const [isThemeStale, setIsThemeStale] = useState(false);
  const pendingThemeRef = useRef<ThemeName | null>(null);
  const previousThemeRef = useRef<ThemeName | null>(null);
  const lastAckTimestampRef = useRef<number | null>(null);

  useEffect(() => {
    syncDocumentTheme(theme);
  }, [theme]);

  const configTheme = configQuery.data?.theme;

  useEffect(() => {
    if (!configTheme) {
      return;
    }

    const normalizedTheme = coerceTheme(configTheme);

    if (pendingThemeRef.current) {
      if (normalizedTheme === pendingThemeRef.current) {
        pendingThemeRef.current = null;
        lastAckTimestampRef.current = Date.now();
        setIsThemeStale(false);
        return;
      }
      if (normalizedTheme === previousThemeRef.current) {
        setIsThemeStale(true);
        return;
      }
    }

    if (
      previousThemeRef.current &&
      normalizedTheme === previousThemeRef.current &&
      lastAckTimestampRef.current !== null &&
      Date.now() - lastAckTimestampRef.current < STALE_REPLAY_WINDOW_MS
    ) {
      setIsThemeStale(true);
      return;
    }

    previousThemeRef.current = null;
    setIsThemeStale(false);
    setThemeState(normalizedTheme);
  }, [configTheme]);

  const setTheme = useCallback(
    (nextTheme: ThemeName) => {
      const currentTheme = theme;
      if (currentTheme === nextTheme) {
        syncDocumentTheme(nextTheme);
        return;
      }

      previousThemeRef.current = currentTheme;
      pendingThemeRef.current = nextTheme;
      lastAckTimestampRef.current = null;
      setIsThemeStale(false);
      setThemeState(nextTheme);
      syncDocumentTheme(nextTheme);

      queryClient.setQueryData<RuntimeConfigDto | undefined>(CONFIG_QUERY_KEY, (current) => {
        if (current) {
          return { ...current, theme: nextTheme };
        }
        return { theme: nextTheme } as RuntimeConfigDto;
      });

      void configApi.update({ theme: nextTheme });
    },
    [configApi, queryClient, theme],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, isThemeStale }),
    [isThemeStale, setTheme, theme],
  );

  const accentColor = getThemeAccentColor(theme);
  const appearance = getThemeAppearance(theme);

  return (
    <ThemeContext.Provider value={value}>
      <Theme appearance={appearance} accentColor={accentColor} radius="large">
        {children}
      </Theme>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

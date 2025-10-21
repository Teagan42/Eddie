import { Theme } from "@radix-ui/themes";
import { type QueryCacheNotifyEvent, type QueryClient, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import type { OverviewTheme } from "./types";

export const AVAILABLE_THEMES: readonly OverviewTheme[] = [
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
  { id: "midnight", name: "Midnight" },
  { id: "aurora", name: "Aurora" },
];

const DARK_THEMES = new Set<OverviewTheme["id"]>(["dark", "midnight"]);
const CONFIG_QUERY_KEY = ["config"] as const;
const THEME_ID_SEGMENT_PATTERN = /[-_\s]+/u;

export interface ThemeState {
  readonly theme: OverviewTheme["id"];
  readonly setTheme: (nextTheme: OverviewTheme["id"]) => void;
  readonly isThemeStale: boolean;
}

const ThemeContext = createContext<ThemeState | null>(null);

function syncDocumentTheme(theme: OverviewTheme["id"]): void {
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

export function formatThemeLabel(
  theme: OverviewTheme["id"],
  themes: readonly OverviewTheme[] = AVAILABLE_THEMES,
): string {
  const match = themes.find((availableTheme) => availableTheme.id === theme);
  if (match?.name) {
    return match.name;
  }
  if (typeof theme === "string" && theme.length > 0) {
    return theme
      .split(THEME_ID_SEGMENT_PATTERN)
      .filter(Boolean)
      .map(titleCase)
      .join(" ");
  }
  return "Unknown";
}

function titleCase(segment: string): string {
  if (segment.length === 0) {
    return segment;
  }
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

function readConfigTheme(queryClient: QueryClient): OverviewTheme["id"] | undefined {
  const config = queryClient.getQueryData<{ theme?: OverviewTheme["id"] }>(CONFIG_QUERY_KEY);
  return config?.theme;
}

function isConfigQueryEvent(event: QueryCacheNotifyEvent): boolean {
  const key = event.query?.queryKey;
  return Array.isArray(key) && key[0] === CONFIG_QUERY_KEY[0];
}

export function ThemeProvider({ children }: { readonly children?: ReactNode }): JSX.Element {
  const [theme, setThemeState] = useState<OverviewTheme["id"]>(() => AVAILABLE_THEMES[0]?.id ?? "light");
  const [isThemeStale, setIsThemeStale] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    syncDocumentTheme(theme);
  }, [theme]);

  const setTheme = useCallback((nextTheme: OverviewTheme["id"]) => {
    setIsThemeStale(false);
    setThemeState(nextTheme);
    syncDocumentTheme(nextTheme);
  }, []);

  useEffect(() => {
    const updateStaleState = (): void => {
      const configTheme = readConfigTheme(queryClient);
      if (!configTheme) {
        setIsThemeStale(false);
        return;
      }
      setIsThemeStale(configTheme !== theme);
    };

    updateStaleState();

    const unsubscribe = queryClient.getQueryCache().subscribe((event: QueryCacheNotifyEvent) => {
      if (isConfigQueryEvent(event)) {
        updateStaleState();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [queryClient, theme]);

  const appearance = isDarkTheme(theme) ? "dark" : "light";
  const accentColor = isDarkTheme(theme) ? "iris" : "jade";

  const value = useMemo<ThemeState>(() => ({ theme, setTheme, isThemeStale }), [isThemeStale, setTheme, theme]);

  return (
    <ThemeContext.Provider value={value}>
      <Theme accentColor={accentColor} radius="large" appearance={appearance}>
        {children ?? null}
      </Theme>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeState {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

export function isDarkTheme(theme: OverviewTheme["id"]): boolean {
  return DARK_THEMES.has(theme);
}

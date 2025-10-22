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
import { getThemeAccentColor, getThemeAppearance, isDarkTheme } from "./themes.js";
import { useApi } from "@/api/api-provider.js";

const CONFIG_QUERY_KEY = ["config"] as const;

interface ThemeContextValue {
  theme: RuntimeConfigDto["theme"];
  setTheme: (theme: RuntimeConfigDto["theme"]) => void;
  isThemeStale: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function syncDocumentTheme(theme: RuntimeConfigDto["theme"]): void {
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

const THEME_TRANSITION_CLASS = "theme-transition";
const THEME_TRANSITION_MS = 320;
const STALE_REPLAY_WINDOW_MS = 1000;

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const api = useApi();
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    queryKey: CONFIG_QUERY_KEY,
    queryFn: () => api.http.config.get(),
  });

  const [theme, setThemeState] = useState<RuntimeConfigDto["theme"]>(() => {
    return (configQuery.data?.theme ?? "dark") as RuntimeConfigDto["theme"];
  });
  const [isThemeStale, setIsThemeStale] = useState(false);
  const markThemeStale = useCallback(() => setIsThemeStale(true), []);
  const markThemeStable = useCallback(() => setIsThemeStale(false), []);
  const userOverrideRef = useRef(false);
  const pendingThemeRef = useRef<RuntimeConfigDto["theme"] | null>(null);
  const previousThemeRef = useRef<RuntimeConfigDto["theme"] | null>(null);
  const lastAckTimestampRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleReplayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStaleReplayTimeout = useCallback(() => {
    if (staleReplayTimeoutRef.current) {
      clearTimeout(staleReplayTimeoutRef.current);
      staleReplayTimeoutRef.current = null;
    }
  }, []);

  const clearThemeTransition = useCallback(() => {
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove(THEME_TRANSITION_CLASS);
    }
  }, []);

  const beginThemeTransition = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }
    clearThemeTransition();
    const root = document.documentElement;
    root.classList.add(THEME_TRANSITION_CLASS);
    transitionTimeoutRef.current = setTimeout(() => {
      root.classList.remove(THEME_TRANSITION_CLASS);
      transitionTimeoutRef.current = null;
    }, THEME_TRANSITION_MS);
  }, [clearThemeTransition]);

  useEffect(
    () => () => {
      clearThemeTransition();
      clearStaleReplayTimeout();
    },
    [clearStaleReplayTimeout, clearThemeTransition]
  );

  useEffect(() => {
    const serverTheme = configQuery.data?.theme as RuntimeConfigDto["theme"] | undefined;
    if (!serverTheme) {
      return;
    }

    if (pendingThemeRef.current) {
      if (serverTheme === pendingThemeRef.current) {
        pendingThemeRef.current = null;
        userOverrideRef.current = false;
        lastAckTimestampRef.current = Date.now();
        clearStaleReplayTimeout();
        markThemeStable();
      } else if (previousThemeRef.current && serverTheme === previousThemeRef.current) {
        markThemeStale();
      }
      return;
    }

    const previousTheme = previousThemeRef.current;
    const lastAck = lastAckTimestampRef.current;
    const isStaleReplay =
      previousTheme !== null &&
      serverTheme === previousTheme &&
      lastAck !== null &&
      Date.now() - lastAck < STALE_REPLAY_WINDOW_MS;

    if (isStaleReplay) {
      markThemeStale();
      clearStaleReplayTimeout();
      staleReplayTimeoutRef.current = setTimeout(() => {
        staleReplayTimeoutRef.current = null;
        previousThemeRef.current = null;
        lastAckTimestampRef.current = null;
        markThemeStable();
        void queryClient.invalidateQueries({ queryKey: CONFIG_QUERY_KEY });
      }, STALE_REPLAY_WINDOW_MS);
      return;
    }

    previousThemeRef.current = null;
    lastAckTimestampRef.current = null;
    markThemeStable();

    if (serverTheme === theme) {
      userOverrideRef.current = false;
      markThemeStable();
      return;
    }

    if (!userOverrideRef.current) {
      beginThemeTransition();
      setThemeState(serverTheme);
      userOverrideRef.current = false;
    }
  }, [
    beginThemeTransition,
    clearStaleReplayTimeout,
    configQuery.data?.theme,
    markThemeStable,
    markThemeStale,
    queryClient,
    theme,
  ]);

  useEffect(() => {
    syncDocumentTheme(theme);
  }, [theme]);

  const setTheme = useCallback(
    (nextTheme: RuntimeConfigDto["theme"]) => {
      userOverrideRef.current = true;
      previousThemeRef.current = theme;
      pendingThemeRef.current = nextTheme;
      lastAckTimestampRef.current = null;
      clearStaleReplayTimeout();
      beginThemeTransition();
      setThemeState(nextTheme);
      syncDocumentTheme(nextTheme);
      markThemeStable();
      queryClient.setQueryData<RuntimeConfigDto | undefined>(CONFIG_QUERY_KEY, (current: RuntimeConfigDto | undefined) => {
        if (current) {
          return { ...current, theme: nextTheme };
        }
        return current;
      });
      void api.http.config.update({ theme: nextTheme });
    },
    [api, beginThemeTransition, clearStaleReplayTimeout, markThemeStable, queryClient, theme]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, isThemeStale }),
    [isThemeStale, setTheme, theme]
  );

  const accentColor = getThemeAccentColor(theme);
  const appearance = getThemeAppearance(theme);

  return (
    <ThemeContext.Provider value={value}>
      <Theme accentColor={accentColor} radius="large" appearance={appearance}>
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

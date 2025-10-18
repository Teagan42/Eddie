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
import { useApi } from "@/api/api-provider";

const CONFIG_QUERY_KEY = ["config"] as const;

interface ThemeContextValue {
  theme: RuntimeConfigDto["theme"];
  setTheme: (theme: RuntimeConfigDto["theme"]) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function syncDocumentTheme(theme: RuntimeConfigDto["theme"]): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

const THEME_TRANSITION_CLASS = "theme-transition";
const THEME_TRANSITION_MS = 320;

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
  const userOverrideRef = useRef(false);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => () => clearThemeTransition(), [clearThemeTransition]);

  useEffect(() => {
    const serverTheme = configQuery.data?.theme as RuntimeConfigDto["theme"] | undefined;
    if (!serverTheme) {
      return;
    }

    if (serverTheme === theme) {
      userOverrideRef.current = false;
      return;
    }

    if (!userOverrideRef.current) {
      beginThemeTransition();
      setThemeState(serverTheme);
    }
  }, [beginThemeTransition, configQuery.data?.theme, theme]);

  useEffect(() => {
    syncDocumentTheme(theme);
  }, [theme]);

  const setTheme = useCallback(
    (nextTheme: RuntimeConfigDto["theme"]) => {
      userOverrideRef.current = true;
      beginThemeTransition();
      setThemeState(nextTheme);
      syncDocumentTheme(nextTheme);
      queryClient.setQueryData<RuntimeConfigDto | undefined>(CONFIG_QUERY_KEY, (current) => {
        if (current) {
          return { ...current, theme: nextTheme };
        }
        return current;
      });
      void api.http.config.update({ theme: nextTheme });
    },
    [api, beginThemeTransition, queryClient]
  );

  const value = useMemo<ThemeContextValue>(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>
      <Theme accentColor="jade" radius="large" appearance={theme}>
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

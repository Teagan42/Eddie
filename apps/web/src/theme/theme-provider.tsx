import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
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
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const api = useApi();
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    queryKey: CONFIG_QUERY_KEY,
    queryFn: () => api.http.config.get(),
  });

  const theme = (configQuery.data?.theme ?? "dark") as RuntimeConfigDto["theme"];

  useEffect(() => {
    syncDocumentTheme(theme);
  }, [theme]);

  const setTheme = useCallback(
    (nextTheme: RuntimeConfigDto["theme"]) => {
      syncDocumentTheme(nextTheme);
      queryClient.setQueryData<RuntimeConfigDto | undefined>(CONFIG_QUERY_KEY, (current) => {
        if (current) {
          return { ...current, theme: nextTheme };
        }
        if (configQuery.data) {
          return { ...configQuery.data, theme: nextTheme };
        }
        return current;
      });
      void api.http.config.update({ theme: nextTheme });
    },
    [api, configQuery.data, queryClient]
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

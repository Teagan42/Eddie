import { useEffect, useMemo, type PropsWithChildren } from "react";
import type { RuntimeConfigDto } from "@eddie/api-client";
import { Theme } from "@radix-ui/themes";

import { getThemeAccentColor, getThemeAppearance } from "./themes";
import { syncDocumentTheme } from "./syncDocumentTheme";

export type EddieThemeProviderProps = PropsWithChildren<{
  theme: RuntimeConfigDto["theme"];
}>;

export function EddieThemeProvider({ theme, children }: EddieThemeProviderProps): JSX.Element {
  useEffect(() => {
    syncDocumentTheme(theme);
  }, [theme]);

  const themeProps = useMemo(
    () => ({
      accentColor: getThemeAccentColor(theme),
      appearance: getThemeAppearance(theme),
    }),
    [theme],
  );

  return (
    <Theme accentColor={themeProps.accentColor} appearance={themeProps.appearance} radius="large">
      {children}
    </Theme>
  );
}

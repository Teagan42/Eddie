import type { RuntimeConfigDto } from "@eddie/api-client";

import { isDarkTheme } from "./themes";

export function syncDocumentTheme(theme: RuntimeConfigDto["theme"]): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.dataset.theme = theme;

  if (isDarkTheme(theme)) {
    root.classList.add("dark");
    return;
  }

  root.classList.remove("dark");
}

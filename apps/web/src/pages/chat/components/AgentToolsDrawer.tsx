import type { RuntimeConfigDto } from "@eddie/api-client";
import {
  AgentToolsDrawer as UiAgentToolsDrawer,
  type AgentToolsDrawerProps as UiAgentToolsDrawerProps,
} from "@eddie/ui";
import { useTheme } from "next-themes";

import {
  getThemeAccentColor,
  getThemeAppearance,
} from "@/theme/themes.js";

const DEFAULT_THEME: RuntimeConfigDto["theme"] = "dark";

type WrappedAgentToolsDrawerProps = Omit<
  UiAgentToolsDrawerProps<{ theme: RuntimeConfigDto["theme"] }, string, string>,
  "useTheme" | "getThemeAccentColor" | "getThemeAppearance"
>;

export type AgentToolsDrawerProps = WrappedAgentToolsDrawerProps;

function useRuntimeTheme(): { theme: RuntimeConfigDto["theme"] } {
  const { resolvedTheme } = useTheme();
  const theme = (resolvedTheme ?? DEFAULT_THEME) as RuntimeConfigDto["theme"];
  return { theme };
}

export function AgentToolsDrawer(
  props: AgentToolsDrawerProps,
): JSX.Element {
  return (
    <UiAgentToolsDrawer
      {...props}
      useTheme={useRuntimeTheme}
      getThemeAccentColor={getThemeAccentColor}
      getThemeAppearance={getThemeAppearance}
    />
  );
}

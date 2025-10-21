import { Box, Flex, Heading, ScrollArea, Text, Theme } from "@radix-ui/themes";
import type { JSX } from "react";

import { AgentExecutionTree } from "./AgentExecutionTree";
import type { AgentExecutionTreeProps } from "./AgentExecutionTree";
import { ContextBundlesPanel } from "./ContextBundlesPanel";
import type { ContextBundlesPanelProps } from "./ContextBundlesPanel";
import type { ExecutionContextBundle, ExecutionTreeState } from "./types";
import { isDarkTheme, useTheme } from "../overview/theme";
import type { OverviewTheme } from "../overview/types";

const DEFAULT_THEME_ID: OverviewTheme["id"] = "dark";

const AGENT_TOOLS_DESCRIPTION =
  "Inspect tool calls, context, and spawned agents for this session.";
const AGENT_TOOLS_DRAWER_TITLE = "Agent tools";
const AGENT_EXECUTION_TITLE = "Agent execution";

export interface AgentToolsDrawerProps {
  readonly executionTreeState: ExecutionTreeState | null | undefined;
  readonly selectedAgentId: AgentExecutionTreeProps["selectedAgentId"];
  readonly onSelectAgent: AgentExecutionTreeProps["onSelectAgent"];
  readonly focusedToolInvocationId: AgentExecutionTreeProps["focusedInvocationId"];
  readonly onFocusToolInvocation: NonNullable<AgentExecutionTreeProps["onFocusInvocation"]>;
  readonly contextPanelId: ContextBundlesPanelProps["id"];
  readonly contextBundles?: ExecutionContextBundle[] | undefined;
  readonly isContextPanelCollapsed: ContextBundlesPanelProps["collapsed"];
  readonly onToggleContextPanel: ContextBundlesPanelProps["onToggle"];
}

export function AgentToolsDrawer({
  executionTreeState,
  selectedAgentId,
  onSelectAgent,
  focusedToolInvocationId,
  onFocusToolInvocation,
  contextPanelId,
  contextBundles,
  isContextPanelCollapsed,
  onToggleContextPanel,
}: AgentToolsDrawerProps): JSX.Element {
  const themeName = useThemeNameOrFallback();
  const accentColor = isDarkTheme(themeName) ? "iris" : "jade";
  const appearance = isDarkTheme(themeName) ? "dark" : "light";
  const titleId = "agent-tools-drawer-title";
  const descriptionId = "agent-tools-drawer-description";

  return (
    <Theme appearance={appearance} accentColor={accentColor} radius="large" asChild>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex h-full w-full flex-col border-l border-white/10 bg-slate-950/95 text-white sm:max-w-xl md:max-w-2xl lg:max-w-3xl"
      >
        <header className="space-y-2 text-left">
          <Heading as="h2" id={titleId} size="6" className="text-white">
            {AGENT_TOOLS_DRAWER_TITLE}
          </Heading>
          <p id={descriptionId} className="text-sm text-slate-200/80">
            {AGENT_TOOLS_DESCRIPTION}
          </p>
        </header>
        <ScrollArea type="always" className="flex-1 pr-4">
          <Flex direction="column" gap="4" className="pb-6">
            <Box className="space-y-4 rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-[0_35px_65px_-45px_rgba(56,189,248,0.5)] backdrop-blur-xl">
              <Heading as="h3" size="4" className="text-white">
                {AGENT_EXECUTION_TITLE}
              </Heading>
              <Text size="2" color="gray" className="text-slate-200/85">
                {AGENT_TOOLS_DESCRIPTION}
              </Text>
              <AgentExecutionTree
                state={executionTreeState}
                selectedAgentId={selectedAgentId}
                onSelectAgent={onSelectAgent}
                focusedInvocationId={focusedToolInvocationId}
                onFocusInvocation={onFocusToolInvocation}
              />
            </Box>
            <ContextBundlesPanel
              id={contextPanelId}
              bundles={contextBundles}
              collapsed={isContextPanelCollapsed}
              onToggle={onToggleContextPanel}
            />
          </Flex>
        </ScrollArea>
      </section>
    </Theme>
  );
}

function useThemeNameOrFallback(): OverviewTheme["id"] {
  try {
    return useTheme().theme;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

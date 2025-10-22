import { Box, Flex, Heading, ScrollArea, Text, Theme, ThemeProps } from '@radix-ui/themes';
import type { RuntimeConfigDto } from '@eddie/api-client';

import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../vendor/components/ui/sheet';

import type { ContextBundlesPanelProps } from './ContextBundlesPanel';
import type { AgentExecutionTreeProps } from '@eddie/ui';
import { AgentExecutionTree } from '@eddie/ui';
import { ContextBundlesPanel } from './ContextBundlesPanel';

const DEFAULT_THEME: RuntimeConfigDto['theme'] = 'dark';
type UseTheme = () => { theme: RuntimeConfigDto['theme'] };

function useThemeNameOrFallback(useTheme: UseTheme): RuntimeConfigDto['theme'] {
  try {
    return useTheme().theme;
  } catch {
    return DEFAULT_THEME;
  }
}

type GetThemeAttribute<T extends {theme: string}, R extends string> = (theme: T) => R;

const AGENT_TOOLS_DESCRIPTION =
  'Inspect tool calls, context, and spawned agents for this session.';
const AGENT_TOOLS_DRAWER_TITLE = 'Agent tools';
const AGENT_EXECUTION_TITLE = 'Agent execution';

export interface AgentToolsDrawerProps<TTheme extends { theme: string }, R1 extends string, R2 extends string> {
  executionTreeState: AgentExecutionTreeProps['state'];
  selectedAgentId: AgentExecutionTreeProps['selectedAgentId'];
  onSelectAgent: AgentExecutionTreeProps['onSelectAgent'];
  focusedToolInvocationId: string | null;
  onFocusToolInvocation: (invocationId: string | null) => void;
  contextPanelId: ContextBundlesPanelProps['id'];
  contextBundles?: ContextBundlesPanelProps['bundles'];
  isContextPanelCollapsed: ContextBundlesPanelProps['collapsed'];
  onToggleContextPanel: ContextBundlesPanelProps['onToggle'];
  useTheme: UseTheme;
  getThemeAccentColor: GetThemeAttribute<TTheme, R1>;
  getThemeAppearance: GetThemeAttribute<TTheme, R2>;
}

export function AgentToolsDrawer<TTheme extends { theme: string }, R1 extends string, R2 extends string>({
  executionTreeState,
  selectedAgentId,
  onSelectAgent,
  focusedToolInvocationId,
  onFocusToolInvocation,
  contextPanelId,
  contextBundles,
  isContextPanelCollapsed,
  onToggleContextPanel,
  useTheme,
  getThemeAccentColor,
  getThemeAppearance,
}: AgentToolsDrawerProps<TTheme, R1, R2>): JSX.Element {
  const themeName = useThemeNameOrFallback(useTheme);
  const accentColor = getThemeAccentColor(themeName);
  const appearance = getThemeAppearance(themeName);

  return (
    <Theme appearance={appearance as ThemeProps['appearance']} accentColor={accentColor as ThemeProps['accentColor']} radius="large" asChild>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col border-l border-white/10 bg-slate-950/95 text-white sm:max-w-xl md:max-w-2xl lg:max-w-3xl"
      >
        <SheetHeader className="space-y-2 text-left">
          <SheetTitle className="text-2xl font-semibold text-white">
            {AGENT_TOOLS_DRAWER_TITLE}
          </SheetTitle>
          <SheetDescription className="text-sm text-slate-200/80">
            {AGENT_TOOLS_DESCRIPTION}
          </SheetDescription>
        </SheetHeader>
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
      </SheetContent>
    </Theme>
  );
}

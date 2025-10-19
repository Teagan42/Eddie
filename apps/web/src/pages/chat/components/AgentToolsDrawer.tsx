import { Box, Flex, Heading, ScrollArea, Text } from '@radix-ui/themes';

import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/vendor/components/ui/sheet';

import type { ContextBundlesPanelProps } from './ContextBundlesPanel';
import type { AgentExecutionTreeProps } from './AgentExecutionTree';
import { AgentExecutionTree } from './AgentExecutionTree';
import { ContextBundlesPanel } from './ContextBundlesPanel';

const AGENT_TOOLS_DESCRIPTION =
  'Inspect tool calls, context, and spawned agents for this session.';
const AGENT_TOOLS_DRAWER_TITLE = 'Agent tools';
const AGENT_EXECUTION_TITLE = 'Agent execution';

export interface AgentToolsDrawerProps {
  executionTreeState: AgentExecutionTreeProps['state'];
  selectedAgentId: AgentExecutionTreeProps['selectedAgentId'];
  onSelectAgent: AgentExecutionTreeProps['onSelectAgent'];
  contextPanelId: ContextBundlesPanelProps['id'];
  contextBundles?: ContextBundlesPanelProps['bundles'];
  isContextPanelCollapsed: ContextBundlesPanelProps['collapsed'];
  onToggleContextPanel: ContextBundlesPanelProps['onToggle'];
}

export function AgentToolsDrawer({
  executionTreeState,
  selectedAgentId,
  onSelectAgent,
  contextPanelId,
  contextBundles,
  isContextPanelCollapsed,
  onToggleContextPanel,
}: AgentToolsDrawerProps): JSX.Element {
  return (
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
  );
}

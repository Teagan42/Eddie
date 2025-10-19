import type { ReactNode } from 'react';
import { Box, Flex, Heading, IconButton, Text, Tooltip } from '@radix-ui/themes';
import { ChevronDownIcon, ChevronRightIcon } from '@radix-ui/react-icons';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/vendor/components/ui/collapsible';

const SIDEBAR_PANEL_CLASS =
  'relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-sky-500/12 via-slate-900/70 to-slate-900/40 shadow-[0_35px_65px_-45px_rgba(56,189,248,0.55)] backdrop-blur-xl';

const COLLAPSIBLE_CONTENT_CLASS =
  'grid text-sm text-slate-200/90 transition-all duration-500 ease-out data-[state=closed]:grid-rows-[0fr] data-[state=open]:grid-rows-[1fr] data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down';

export interface CollapsiblePanelProps {
  id: string;
  title: string;
  description?: string;
  collapsed: boolean;
  onToggle: (id: string, collapsed: boolean) => void;
  children: ReactNode;
}

export function CollapsiblePanel({
  id,
  title,
  description,
  collapsed,
  onToggle,
  children,
}: CollapsiblePanelProps): JSX.Element {
  return (
    <Collapsible
      asChild
      open={!collapsed}
      onOpenChange={(isOpen) => onToggle(id, !isOpen)}
    >
      <section className={`${SIDEBAR_PANEL_CLASS} flex flex-col gap-3 p-5 text-white`}>
        <Flex align="center" justify="between" gap="3">
          <Box>
            <Heading as="h3" size="3">
              {title}
            </Heading>
            {description ? (
              <Text size="2" color="gray">
                {description}
              </Text>
            ) : null}
          </Box>
          <Tooltip content={collapsed ? 'Expand' : 'Collapse'}>
            <CollapsibleTrigger asChild>
              <IconButton
                variant="solid"
                size="2"
                aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
              >
                {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
              </IconButton>
            </CollapsibleTrigger>
          </Tooltip>
        </Flex>
        <CollapsibleContent asChild className={COLLAPSIBLE_CONTENT_CLASS}>
          <Box className="overflow-hidden">{children}</Box>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

import type { ReactNode } from 'react';
import { Box, Flex, Heading, IconButton, Text, Tooltip } from '@radix-ui/themes';
import { ChevronDownIcon, ChevronRightIcon } from '@radix-ui/react-icons';

const SIDEBAR_PANEL_CLASS =
  'relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-sky-500/12 via-slate-900/70 to-slate-900/40 shadow-[0_35px_65px_-45px_rgba(56,189,248,0.55)] backdrop-blur-xl';

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
          <IconButton
            variant="solid"
            size="2"
            onClick={() => onToggle(id, !collapsed)}
            aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
          </IconButton>
        </Tooltip>
      </Flex>
      {!collapsed ? <Box className="text-sm text-slate-200/90">{children}</Box> : null}
    </section>
  );
}

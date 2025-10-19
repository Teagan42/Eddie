import type { ReactNode } from 'react';
import { Box, Flex, Heading, IconButton, Text, Tooltip } from '@radix-ui/themes';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDownIcon, ChevronRightIcon } from '@radix-ui/react-icons';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/vendor/components/ui/collapsible';

const SIDEBAR_PANEL_CLASS =
  'relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-sky-500/12 via-slate-900/70 to-slate-900/40 shadow-[0_35px_65px_-45px_rgba(56,189,248,0.55)] backdrop-blur-xl';

const COLLAPSIBLE_CONTENT_VARIANTS = {
  open: {
    opacity: 1,
    height: 'auto',
    filter: 'blur(0px)',
  },
  collapsed: {
    opacity: 0,
    height: 0,
    filter: 'blur(6px)',
  },
} as const;

const COLLAPSIBLE_CONTENT_TRANSITION = {
  duration: 0.3,
  ease: [0.22, 1, 0.36, 1],
} as const;

const COLLAPSIBLE_CONTENT_CLASS = 'grid overflow-hidden text-sm text-slate-200/90';

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
  const shouldRenderContent = !collapsed;
  const contentKey = `${id}-collapsible`;
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
        <CollapsibleContent forceMount>
          <AnimatePresence initial={false}>
            {shouldRenderContent ? (
              <motion.div
                key={contentKey}
                data-testid="collapsible-panel-motion"
                data-motion="collapsible-panel-content"
                initial="collapsed"
                animate="open"
                exit="collapsed"
                variants={COLLAPSIBLE_CONTENT_VARIANTS}
                transition={COLLAPSIBLE_CONTENT_TRANSITION}
                className={COLLAPSIBLE_CONTENT_CLASS}
              >
                <Box className="overflow-hidden">{children}</Box>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

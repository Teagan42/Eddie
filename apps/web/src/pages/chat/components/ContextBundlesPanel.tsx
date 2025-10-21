import { ScrollArea, Text } from '@radix-ui/themes';
import * as Accordion from '@radix-ui/react-accordion';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import type {
  OrchestratorContextBundleDto,
  OrchestratorContextBundleFileDto,
} from '@eddie/api-client';
import { CollapsiblePanel } from '@eddie/ui/chat';

type ContextBundleWithFiles = OrchestratorContextBundleDto & {
  files?: OrchestratorContextBundleFileDto[];
};

export interface ContextBundlesPanelProps {
  id: string;
  bundles?: ContextBundleWithFiles[];
  collapsed: boolean;
  onToggle: (id: string, collapsed: boolean) => void;
}

export function ContextBundlesPanel({
  id,
  bundles = [],
  collapsed,
  onToggle,
}: ContextBundlesPanelProps): JSX.Element {
  const hasBundles = bundles.length > 0;

  return (
    <TooltipProvider>
      <CollapsiblePanel
        id={id}
        title="Context bundles"
        description="Datasets staged for the next invocation"
        collapsed={collapsed}
        onToggle={onToggle}
      >
        {!hasBundles ? (
          <Text size="2" color="gray">
            No context bundles associated yet.
          </Text>
        ) : (
          <Accordion.Root type="multiple" className="space-y-2">
            {bundles.map((bundle) => (
              <Accordion.Item
                key={bundle.id}
                value={bundle.id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]"
              >
                <Accordion.Header>
                  <Accordion.Trigger
                    aria-label={`Toggle bundle ${bundle.label} contents`}
                    className="group flex w-full items-start justify-between gap-4 px-4 py-3 text-left text-white transition focus:outline-none focus-visible:ring focus-visible:ring-sky-500/60"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <Text as="span" weight="medium" className="text-lg text-white">
                        {bundle.label}
                      </Text>
                      {bundle.summary ? (
                        <Text as="span" size="2" color="gray" className="leading-snug text-slate-300/95">
                          {bundle.summary}
                        </Text>
                      ) : null}
                      <Text as="span" size="1" color="gray">
                        {bundle.fileCount} {bundle.fileCount === 1 ? 'file' : 'files'} •{' '}
                        {formatByteSize(bundle.sizeBytes)}
                      </Text>
                    </div>
                    <Text
                      size="1"
                      color="gray"
                      className="rounded-full border border-white/15 bg-white/[0.08] px-3 py-1 font-medium text-white/80 transition group-data-[state=open]:bg-white/15"
                    >
                      {bundle.files?.length ? 'View contents' : 'Details'}
                    </Text>
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className="border-t border-white/10 bg-slate-950/70 px-4 pb-4 pt-3 text-sm text-slate-100">
                  {bundle.files?.length ? (
                    <ScrollArea type="always" scrollbars="vertical" className="max-h-56 pr-4">
                      <ul className="space-y-2">
                        {bundle.files.map((file) => (
                          <li
                            key={file.path}
                            className="flex items-start justify-between gap-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2"
                          >
                            <div className="min-w-0 flex-1">
                              <Text as="span" className="block truncate font-mono text-xs text-white/95">
                                {file.path}
                              </Text>
                              {file.preview ? (
                                <Text as="span" size="1" color="gray" className="line-clamp-2 text-left">
                                  {file.preview}
                                </Text>
                              ) : null}
                            </div>
                            <Text as="span" size="1" color="gray" className="shrink-0 font-medium">
                              {formatByteSize(file.sizeBytes)}
                            </Text>
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  ) : (
                    <Text size="2" color="gray">
                      This bundle has not reported individual files yet.
                    </Text>
                  )}
                </Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        )}
      </CollapsiblePanel>
    </TooltipProvider>
  );
}

const NUMBER_FORMAT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
});

const BYTE_UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'] as const;

function formatByteSize(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return '0 bytes';
  }

  let unitIndex = 0;
  let result = value;

  while (result >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    result /= 1024;
    unitIndex += 1;
  }

  return `${NUMBER_FORMAT.format(result)} ${BYTE_UNITS[unitIndex]}`;
}

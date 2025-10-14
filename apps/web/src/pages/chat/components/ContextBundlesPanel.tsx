import { useState } from "react";
import { Box, Button, Flex, ScrollArea, Text } from "@radix-ui/themes";
import { ArchiveIcon, FileTextIcon } from "@radix-ui/react-icons";
import type { OrchestratorContextBundleDto } from "@eddie/api-client";
import { CollapsiblePanel } from "./CollapsiblePanel";

const formatBytes = (size: number): string => {
  if (Number.isNaN(size) || size <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  const power = Math.min(
    Math.floor(Math.log(size) / Math.log(1024)),
    units.length - 1,
  );
  const value = size / 1024 ** power;
  return `${value.toFixed(value >= 10 || power === 0 ? 0 : 1)} ${units[power]}`;
};

const bundleCardClassName =
  "rounded-xl border border-white/10 bg-slate-900/70 p-4 shadow-[0_12px_40px_-25px_rgba(15,118,110,0.65)] backdrop-blur";

export interface ContextBundlesPanelProps {
  panelId: string;
  bundles: OrchestratorContextBundleDto[];
  collapsed: boolean;
  onToggle(id: string, collapsed: boolean): void;
}

export function ContextBundlesPanel({
  panelId,
  bundles,
  collapsed,
  onToggle,
}: ContextBundlesPanelProps): JSX.Element {
  const [expandedBundleId, setExpandedBundleId] = useState<string | null>(null);

  const hasBundles = bundles.length > 0;

  const handleSelectBundle = (bundleId: string) => {
    setExpandedBundleId((current) => (current === bundleId ? null : bundleId));
  };

  return (
    <CollapsiblePanel
      id={panelId}
      title="Context bundles"
      description="Datasets staged for the next invocation"
      collapsed={collapsed}
      onToggle={onToggle}
    >
      {hasBundles ? (
        <Flex direction="column" gap="3" data-testid="context-bundles-list">
          {bundles.map((bundle) => {
            const isActive = bundle.id === expandedBundleId;
            const fileCountLabel = `${bundle.fileCount} file${bundle.fileCount === 1 ? "" : "s"}`;
            const metadataSummary = `${fileCountLabel} • ${formatBytes(bundle.sizeBytes)}`;
            const hasFileEntries = (bundle.files?.length ?? 0) > 0;
            const showFilesButton = bundle.fileCount > 0 && hasFileEntries;

            return (
              <Box key={bundle.id} className={bundleCardClassName}>
                <Flex align="start" justify="between" gap="4">
                  <Flex direction="column" gap="1" className="min-w-0">
                    <Flex align="center" gap="2">
                      <ArchiveIcon aria-hidden="true" className="text-emerald-200" />
                      <Text as="h3" size="3" weight="medium" className="truncate text-emerald-50">
                        {bundle.label}
                      </Text>
                    </Flex>
                    {bundle.summary ? (
                      <Text as="p" size="2" color="gray" className="leading-snug text-slate-200/80">
                        {bundle.summary}
                      </Text>
                    ) : null}
                    <Text size="1" color="gray">
                      {metadataSummary}
                    </Text>
                  </Flex>
                  {showFilesButton ? (
                    <Button
                      size="1"
                      variant="soft"
                      onClick={() => handleSelectBundle(bundle.id)}
                      aria-expanded={isActive}
                      aria-controls={`context-bundle-${bundle.id}-files`}
                      aria-label={
                        isActive
                          ? `Hide files for ${bundle.label}`
                          : `View files for ${bundle.label}`
                      }
                    >
                      {isActive ? "Hide files" : `View files`}
                    </Button>
                  ) : null}
                </Flex>

                {bundle.fileCount > 0 ? (
                  hasFileEntries ? (
                    isActive ? (
                      <Box
                        data-testid="context-bundle-files"
                        className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-slate-950/70"
                      >
                        <ScrollArea type="auto" className="max-h-56">
                          <ul
                            aria-label={`Files in ${bundle.label}`}
                            id={`context-bundle-${bundle.id}-files`}
                            className="divide-y divide-white/5"
                          >
                            {bundle.files?.map((file) => (
                              <li
                                key={`${bundle.id}-${file.path}`}
                                className="flex items-center justify-between gap-3 px-3 py-2 font-mono text-xs text-slate-100"
                              >
                                <Flex align="center" gap="2" className="min-w-0">
                                  <FileTextIcon aria-hidden="true" />
                                  <span className="truncate" title={file.path}>
                                    {file.path}
                                  </span>
                                </Flex>
                                {typeof file.sizeBytes === "number" ? (
                                  <span className="whitespace-nowrap text-slate-400">
                                    {formatBytes(file.sizeBytes)}
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </ScrollArea>
                      </Box>
                    ) : null
                  ) : (
                    <Text size="1" color="gray" className="mt-3">
                      Files are preparing for display.
                    </Text>
                  )
                ) : null}
              </Box>
            );
          })}
        </Flex>
      ) : (
        <Text size="2" color="gray">
          No context bundles associated yet.
        </Text>
      )}
    </CollapsiblePanel>
  );
}

import { Link } from "react-router-dom";
import { Badge, Box, Button, Flex, Heading, Select, Separator, Text } from "@radix-ui/themes";
import { ArrowUpRight, KeyRound } from "lucide-react";
import { cn } from "@/vendor/lib/utils";
import { OverviewStatsGrid, type OverviewStat } from "@eddie/ui/overview";
import type { RuntimeConfigDto } from "@eddie/api-client";
import { AVAILABLE_THEMES, formatThemeLabel } from "@/theme";
import { EddieButton, EddieIcon } from "@eddie/ui";

interface OverviewHeroProps {
  apiKey: string | null;
  apiUrl?: string;
  theme: RuntimeConfigDto["theme"];
  onSelectTheme: (theme: RuntimeConfigDto["theme"]) => void;
  onRemoveApiKey: () => void;
  stats: OverviewStat[];
  isThemeSelectorDisabled?: boolean;
}

export function OverviewHero({
  apiKey,
  apiUrl,
  theme,
  onSelectTheme,
  onRemoveApiKey,
  stats,
  isThemeSelectorDisabled,
}: OverviewHeroProps): JSX.Element {
  const consoleSeparatorClass = cn(
    "border-[color:var(--hero-console-separator)]",
    "dark:border-[color:var(--hero-console-separator-dark)]"
  );

  return (
    <Box
      data-testid="overview-hero"
      className={cn(
        "relative overflow-hidden rounded-[2.75rem] border bg-card bg-gradient-to-br p-10 text-foreground",
        "from-[hsl(var(--hero-surface-from))] via-[hsl(var(--hero-surface-via))] to-[hsl(var(--hero-surface-to))]",
        "shadow-[var(--hero-surface-shadow)] border-border/60",
        "dark:from-[hsl(var(--hero-surface-from-dark))] dark:via-[hsl(var(--hero-surface-via-dark))] dark:to-[hsl(var(--hero-surface-to-dark))]",
        "dark:shadow-[var(--hero-surface-shadow-dark)]"
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 -z-10",
          "bg-[var(--hero-surface-overlay)]",
          "dark:bg-[var(--hero-surface-overlay-dark)]"
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 opacity-80 blur-2xl",
          "[background:var(--hero-surface-lens)]",
          "dark:[background:var(--hero-surface-lens-dark)]"
        )}
      />
      <Flex direction={{ initial: "column", md: "row" }} justify="between" gap="6" align="start">
        <Flex direction="column" gap="5" className="max-w-2xl">
          <Badge
            color="grass"
            variant="surface"
            radius="full"
            className={cn(
              "w-fit",
              "bg-[color:var(--hero-badge-bg)]",
              "text-[color:var(--hero-badge-fg)]",
              "dark:bg-[color:var(--hero-badge-bg-dark)]",
              "dark:text-[color:var(--hero-badge-fg-dark)]"
            )}
          >
            Mission Control
          </Badge>
          <Heading size="8" className="text-balance text-foreground drop-shadow-lg">
            Operate your agentic fleet with cinematic clarity.
          </Heading>
          <Text size="3" className="text-foreground/80">
            Observe sessions, traces, and logs at a glance while keeping configuration and API credentials at your fingertips.
          </Text>
          <Flex gap="3" wrap="wrap">
            <EddieButton>
              <Link to="/chat" className="inline-flex items-center gap-2">
                Launch Chat Console
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </EddieButton>
            <Select.Root value={theme} onValueChange={onSelectTheme} disabled={isThemeSelectorDisabled}>
              <Select.Trigger
                aria-label="Theme"
                size="3"
                className={cn(
                  "w-44 justify-between",
                  "border",
                  "border-[color:var(--hero-outline-border)]",
                  "bg-[color:var(--hero-outline-bg)]",
                  "text-[color:var(--hero-outline-foreground)]",
                  "hover:bg-[color:var(--hero-outline-bg-hover)]",
                  "dark:border-[color:var(--hero-outline-border-dark)]",
                  "dark:bg-[color:var(--hero-outline-bg-dark)]",
                  "dark:text-[color:var(--hero-outline-foreground-dark)]",
                  "dark:hover:bg-[color:var(--hero-outline-bg-hover-dark)]"
                )}
                data-testid="hero-theme-trigger"
              >
                Theme: {formatThemeLabel(theme)}
              </Select.Trigger>
              <Select.Content
                position="popper"
                className={cn(
                  "min-w-[--radix-select-trigger-width] rounded-2xl border",
                  "border-[color:var(--hero-outline-border)]",
                  "bg-[color:var(--hero-outline-bg)]",
                  "text-[color:var(--hero-outline-foreground)]",
                  "shadow-[var(--hero-surface-shadow)]",
                  "dark:border-[color:var(--hero-outline-border-dark)]",
                  "dark:bg-[color:var(--hero-outline-bg-dark)]",
                  "dark:text-[color:var(--hero-outline-foreground-dark)]",
                  "dark:shadow-[var(--hero-surface-shadow-dark)]"
                )}
              >
                <Select.Group>
                  <Select.Label className="text-[color:var(--hero-outline-foreground)] dark:text-[color:var(--hero-outline-foreground-dark)]">
                    Themes
                  </Select.Label>
                  {AVAILABLE_THEMES.map((availableTheme) => (
                    <Select.Item key={availableTheme} value={availableTheme}>
                      {formatThemeLabel(availableTheme)}
                    </Select.Item>
                  ))}
                </Select.Group>
              </Select.Content>
            </Select.Root>
          </Flex>
        </Flex>
        <Box
          className={cn(
            "relative w-full max-w-xs overflow-hidden rounded-3xl border p-6 backdrop-blur",
            "border-[color:var(--hero-console-border)]",
            "bg-[color:var(--hero-console-bg)]",
            "dark:border-[color:var(--hero-console-border-dark)]",
            "dark:bg-[color:var(--hero-console-bg-dark)]"
          )}
        >
          <div
            className={cn(
              "absolute inset-0 -z-10",
              "bg-[var(--hero-console-overlay)]",
              "dark:bg-[var(--hero-console-overlay-dark)]"
            )}
          />
          <Flex direction="column" gap="4">
            <Flex align="center" justify="between">
              <Text size="1" color="gray" className="uppercase tracking-[0.3em]">
                API Channel
              </Text>
              <Badge variant="solid" color={apiKey ? "grass" : "red"} radius="full">
                {apiKey ? "Connected" : "Idle"}
              </Badge>
            </Flex>
            <Flex align="center" gap="3">
              <EddieIcon icon={KeyRound} />
              <Flex direction="column">
                <Text size="2" weight="medium">
                  {apiKey ? "API key ready" : "No key provided"}
                </Text>
                <Text size="1" color="gray">
                  Keys are stored locally on this device.
                </Text>
              </Flex>
            </Flex>
            <Separator className={consoleSeparatorClass} />
            <Text size="1" color="gray">
              {apiUrl ?? "Awaiting configuration"}
            </Text>
            {apiKey ? (
              <Button
                size="2"
                variant="surface"
                color="red"
                onClick={onRemoveApiKey}
                className="justify-center"
              >
                Remove key
              </Button>
            ) : (
              <Button size="2" variant="soft" color="grass" asChild>
                <Link to="#authentication">Add key</Link>
              </Button>
            )}
          </Flex>
        </Box>
      </Flex>
      <Separator my="6" className={consoleSeparatorClass} />
      <OverviewStatsGrid stats={stats} />
    </Box>
  );
}

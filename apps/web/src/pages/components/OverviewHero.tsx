import { Link } from "react-router-dom";
import { Badge, Box, Button, Flex, Heading, Separator, Text } from "@radix-ui/themes";
import { ArrowUpRight, KeyRound } from "lucide-react";
import type { OverviewStat } from "./OverviewStatsGrid";
import { OverviewStatsGrid } from "./OverviewStatsGrid";

interface OverviewHeroProps {
  apiKey: string | null;
  apiUrl?: string;
  onToggleTheme: () => void;
  onRemoveApiKey: () => void;
  stats: OverviewStat[];
}

export function OverviewHero({ apiKey, apiUrl, onToggleTheme, onRemoveApiKey, stats }: OverviewHeroProps): JSX.Element {
  return (
    <Box className="relative overflow-hidden rounded-[2.75rem] border border-white/15 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-10 shadow-[0_65px_120px_-60px_rgba(14,116,144,0.6)]">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.28),transparent_55%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.28),transparent_50%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-80 blur-2xl [background:conic-gradient(from_120deg_at_50%_50%,rgba(59,130,246,0.4)_0deg,transparent_140deg,rgba(74,222,128,0.35)_240deg,transparent_360deg)]" />
      <Flex direction={{ initial: "column", md: "row" }} justify="between" gap="6" align="start">
        <Flex direction="column" gap="5" className="max-w-2xl">
          <Badge color="grass" variant="surface" radius="full" className="w-fit bg-emerald-500/15 text-emerald-50">
            Mission Control
          </Badge>
          <Heading size="8" className="text-balance text-white drop-shadow-lg">
            Operate your agentic fleet with cinematic clarity.
          </Heading>
          <Text size="3" className="text-white/80">
            Observe sessions, traces, and logs at a glance while keeping configuration and API credentials at your fingertips.
          </Text>
          <Flex gap="3" wrap="wrap">
            <Button
              size="3"
              variant="solid"
              className="bg-gradient-to-r from-emerald-400 via-emerald-500 to-sky-500 text-white shadow-[0_30px_70px_-40px_rgba(45,212,191,0.9)]"
              asChild
            >
              <Link to="/chat" className="inline-flex items-center gap-2">
                Launch Chat Console
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="3"
              variant="outline"
              className="border-white/25 bg-white/20 text-white hover:bg-white/25"
              onClick={onToggleTheme}
            >
              Cycle Theme
            </Button>
          </Flex>
        </Flex>
        <Box className="relative w-full max-w-xs overflow-hidden rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.3),transparent_60%)]" />
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
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20">
                <KeyRound className="h-6 w-6 text-emerald-200" />
              </div>
              <Flex direction="column">
                <Text size="2" weight="medium">
                  {apiKey ? "API key ready" : "No key provided"}
                </Text>
                <Text size="1" color="gray">
                  Keys are stored locally on this device.
                </Text>
              </Flex>
            </Flex>
            <Separator className="border-white/10" />
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
      <Separator my="6" className="border-white/10" />
      <OverviewStatsGrid stats={stats} />
    </Box>
  );
}

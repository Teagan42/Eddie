import { Link } from "react-router-dom";
import type { FC } from "react";
import { Avatar, Button, Flex, Heading, IconButton, Separator, Text } from "@radix-ui/themes";
import { ExitIcon } from "@radix-ui/react-icons";

import { NavigationLink } from "../navigation/NavigationLink";
import type { NavigationLinkProps } from "../navigation/NavigationLink";

export interface AppHeaderProps {
  apiConnected: boolean;
  onClearApiKey: () => void;
  navigation: ReadonlyArray<NavigationLinkProps>;
  addApiKeyHref?: string;
}

export const AppHeader: FC<AppHeaderProps> = ({ apiConnected, onClearApiKey, navigation, addApiKeyHref = "/" }) => {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-900/75 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <Flex align="center" gap="4">
          <div className="relative flex items-center gap-3">
            <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-sky-500 shadow-[0_25px_45px_-30px_rgba(16,185,129,0.95)]">
              <span className="text-lg font-semibold text-white">Ed</span>
            </div>
            <div>
              <Heading size="5" weight="medium" className="tracking-tight text-white">
                Eddie Control Plane
              </Heading>
              <Text size="2" color="gray">
                Operate every orchestrator workflow in style
              </Text>
            </div>
          </div>
          <Separator orientation="vertical" className="hidden h-8 md:block" />
          <Flex align="center" gap="2" className="hidden md:flex">
            {navigation.map((item) => (
              <NavigationLink key={item.to} to={item.to} label={item.label} />
            ))}
          </Flex>
        </Flex>
        <Flex align="center" gap="4">
          <Flex direction="column" gap="1" className="text-right">
            <Text size="1" color="gray" className="font-medium uppercase tracking-[0.2em]">
              API Status
            </Text>
            <Text size="2" className="font-semibold text-emerald-200">
              {apiConnected ? "Connected" : "Awaiting key"}
            </Text>
          </Flex>
          <Avatar fallback="AI" size="3" className="border border-white/10 bg-white/5 text-white" variant="solid" />
          {apiConnected ? (
            <IconButton
              variant="surface"
              size="3"
              color="red"
              onClick={onClearApiKey}
              aria-label="Clear API key"
              className="shadow-[0_15px_35px_-25px_rgba(239,68,68,0.9)]"
            >
              <ExitIcon />
            </IconButton>
          ) : (
            <Button
              size="3"
              variant="solid"
              className="hidden bg-gradient-to-r from-emerald-400 via-emerald-500 to-sky-500 text-white shadow-[0_25px_45px_-25px_rgba(56,189,248,0.85)] md:inline-flex"
              asChild
            >
              <Link to={addApiKeyHref}>Add API Key</Link>
            </Button>
          )}
        </Flex>
      </div>
    </header>
  );
};

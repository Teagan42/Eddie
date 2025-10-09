import { ReactNode } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { Flex, Heading, IconButton, Separator, Text } from "@radix-ui/themes";
import { ChatPage } from "./chat/ChatPage";
import { OverviewPage } from "./OverviewPage";
import { useAuth } from "@/auth/auth-context";
import { ExitIcon } from "@radix-ui/react-icons";

function NavigationLink({ to, label }: { to: string; label: string }): JSX.Element {
  return (
    <Link
      to={to}
      className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent/10 hover:text-foreground"
    >
      {label}
    </Link>
  );
}

function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const { apiKey, setApiKey } = useAuth();

  return (
    <Flex direction="column" className="min-h-screen bg-gray-1 text-foreground">
      <header className="sticky top-0 z-20 border-b border-gray-5 bg-panel/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-3">
          <Flex align="center" gap="3">
            <Heading size="4" weight="medium">
              Eddie Control Plane
            </Heading>
            <Separator orientation="vertical" className="h-6" />
            <NavigationLink to="/" label="Overview" />
            <NavigationLink to="/chat" label="Chat" />
          </Flex>
          <Flex align="center" gap="3">
            <Text size="2" color="gray">
              {apiKey ? "API key connected" : "No API key"}
            </Text>
            {apiKey ? (
              <IconButton
                variant="soft"
                color="red"
                size="2"
                onClick={() => setApiKey(null)}
                aria-label="Clear API key"
              >
                <ExitIcon />
              </IconButton>
            ) : null}
          </Flex>
        </div>
      </header>
      <main className="flex-1 bg-gray-2">{children}</main>
    </Flex>
  );
}

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

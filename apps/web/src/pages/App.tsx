import { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Flex, Separator } from "@radix-ui/themes";
import { OverviewPage } from "./OverviewPage.js";
import { ChatPage } from "./chat/ChatPage.js";
import { useAuth } from "@/auth/auth-context.js";
import { AppHeader, AuroraBackground, NavigationLink } from "@eddie/ui";
import { cn } from "@eddie/ui";
import { ConfigPage } from "./config/ConfigPage.js";

const navigationItems = [
  { to: "/", label: "Overview" },
  { to: "/chat", label: "Chat" },
  { to: "/config", label: "Config" },
];

function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const { apiKey, setApiKey } = useAuth();
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <AuroraBackground className="mix-blend-soft-light" />
      <div
        className={cn(
          "pointer-events-none fixed inset-0",
          "bg-[radial-gradient(var(--app-shell-overlay))]",
          "dark:bg-[radial-gradient(var(--app-shell-overlay-dark))]"
        )}
      />
      <Flex direction="column" className="relative z-10 min-h-screen">
        <AppHeader
          apiConnected={Boolean(apiKey)}
          onClearApiKey={() => setApiKey(null)}
          navigation={navigationItems}
        />
        <main className="relative flex-1">
          <div
            className={cn(
              "absolute inset-0",
              "bg-[radial-gradient(var(--app-shell-main-overlay))]",
              "dark:bg-[radial-gradient(var(--app-shell-main-overlay-dark))]"
            )}
            aria-hidden
          />
          <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-10">
            <Flex direction="column" gap="9">
              <Flex className="md:hidden" direction="column" gap="3">
                <Separator className="opacity-40" />
                <Flex align="center" gap="2">
                  {navigationItems.map((item) => (
                    <NavigationLink key={item.to} to={item.to} label={item.label} />
                  ))}
                </Flex>
              </Flex>
              {children}
            </Flex>
          </div>
        </main>
      </Flex>
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

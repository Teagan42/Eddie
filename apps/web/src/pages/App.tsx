import { ReactNode } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Avatar, Badge, Button, Flex, Heading, IconButton, Separator, Text } from "@radix-ui/themes";
import { ChatPage } from "./chat/ChatPage";
import { OverviewPage } from "./OverviewPage";
import { useAuth } from "@/auth/auth-context";
import { ExitIcon } from "@radix-ui/react-icons";
import { AuroraBackground } from "@/components/aurora-background";
import { cn } from "@/components/lib/utils";

interface NavigationLinkProps {
  to: string;
  label: string;
}

function NavigationLink({ to, label }: NavigationLinkProps): JSX.Element {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={cn(
        "group relative overflow-hidden rounded-full px-4 py-2 text-sm font-medium transition-all",
        isActive
          ? "bg-emerald-500/90 text-emerald-50 shadow-[0_18px_45px_-20px_rgba(16,185,129,0.8)]"
          : "text-foreground/70 hover:-translate-y-0.5 hover:bg-emerald-500/15 hover:text-foreground"
      )}
    >
      <span className="relative z-10 flex items-center gap-2">
        <span>{label}</span>
        {isActive ? (
          <Badge color="grass" variant="solid" radius="full" className="hidden md:inline-flex">
            Active
          </Badge>
        ) : null}
      </span>
      <span className="absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </Link>
  );
}

function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const { apiKey, setApiKey } = useAuth();
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-foreground">
      <AuroraBackground className="mix-blend-screen" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.1),transparent_55%)]" />
      <Flex direction="column" className="relative z-10 min-h-screen">
        <header className="sticky top-0 z-40 border-b border-white/5 bg-slate-950/70 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
            <Flex align="center" gap="4">
              <div className="relative flex items-center gap-3">
                <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-sky-500 shadow-[0_25px_45px_-30px_rgba(16,185,129,0.95)]">
                  <span className="text-lg font-semibold text-slate-950">Ed</span>
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
                <NavigationLink to="/" label="Overview" />
                <NavigationLink to="/chat" label="Chat" />
              </Flex>
            </Flex>
            <Flex align="center" gap="4">
              <Flex direction="column" gap="1" className="text-right">
                <Text size="1" color="gray" className="font-medium uppercase tracking-[0.2em]">
                  API Status
                </Text>
                <Text size="2" className="font-semibold text-emerald-200">
                  {apiKey ? "Connected" : "Awaiting key"}
                </Text>
              </Flex>
              <Avatar
                fallback="AI"
                size="3"
                className="border border-white/10 bg-white/5 text-white"
                variant="solid"
              />
              {apiKey ? (
                <IconButton
                  variant="surface"
                  size="3"
                  color="red"
                  onClick={() => setApiKey(null)}
                  aria-label="Clear API key"
                  className="shadow-[0_15px_35px_-25px_rgba(239,68,68,0.9)]"
                >
                  <ExitIcon />
                </IconButton>
              ) : (
                <Button
                  size="3"
                  variant="solid"
                  className="hidden bg-gradient-to-r from-emerald-400 via-emerald-500 to-sky-500 text-slate-950 shadow-[0_25px_45px_-25px_rgba(56,189,248,0.85)] md:inline-flex"
                  asChild
                >
                  <Link to="/">Add API Key</Link>
                </Button>
              )}
            </Flex>
          </div>
        </header>
        <main className="relative flex-1">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.08),transparent_60%)]" aria-hidden />
          <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-10">
            <Flex direction="column" gap="9">
              <Flex className="md:hidden" direction="column" gap="3">
                <Separator className="opacity-40" />
                <Flex align="center" gap="2">
                  <NavigationLink to="/" label="Overview" />
                  <NavigationLink to="/chat" label="Chat" />
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
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
/*
  const api = useApi();
  const queryClient = useQueryClient();
  const [sessionForm, setSessionForm] = useState<SessionFormState>({
    title: "",
    description: "",
  });
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState<string>("");

  const sessionsQuery = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: () => api.http.chatSessions.list(),
  });

  const tracesQuery = useQuery({
    queryKey: ["traces"],
    queryFn: () => api.http.traces.list(),
  });

  const logsQuery = useQuery({
    queryKey: ["logs"],
    queryFn: () => api.http.logs.list(),
  });

  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: () => api.http.config.get(),
  });

  const messagesQuery = useQuery({
    queryKey: ["chat-sessions", selectedSessionId, "messages"],
    enabled: Boolean(selectedSessionId),
    queryFn: () =>
      selectedSessionId ? api.http.chatSessions.listMessages(selectedSessionId) : Promise.resolve([]),
  });

  const stats = useMemo(
    () => [
      {
        label: "Chat Sessions",
        value: sessionsQuery.data?.length ?? 0,
        hint: "Active collaboration threads",
        accent: "💬",
      },
      {
        label: "Traces",
        value: tracesQuery.data?.length ?? 0,
        hint: "Streaming observability events",
        accent: "🛰️",
      },
      {
        label: "Logs",
        value: logsQuery.data?.length ?? 0,
        hint: "Latest telemetry entries",
        accent: "📡",
      },
    ],
    [sessionsQuery.data, tracesQuery.data, logsQuery.data]
  );

  useEffect(() => {
    if (!selectedSessionId && sessionsQuery.data?.length) {
      setSelectedSessionId(sessionsQuery.data[0]?.id ?? null);
    }
  }, [sessionsQuery.data, selectedSessionId]);

  useEffect(() => {
    const subscriptions = [
      api.sockets.chatSessions.onSessionCreated(() =>
        queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
      ),
      api.sockets.chatSessions.onSessionUpdated((session) => {
        queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
        if (session.id === selectedSessionId) {
          queryClient.invalidateQueries({
            queryKey: ["chat-sessions", session.id, "messages"],
          });
        }
      }),
      api.sockets.chatSessions.onMessageCreated((message) =>
        queryClient.invalidateQueries({
          queryKey: ["chat-sessions", message.sessionId, "messages"],
        })
      ),
      api.sockets.traces.onTraceCreated(() => queryClient.invalidateQueries({ queryKey: ["traces"] })),
      api.sockets.traces.onTraceUpdated(() => queryClient.invalidateQueries({ queryKey: ["traces"] })),
      api.sockets.logs.onLogCreated(() => queryClient.invalidateQueries({ queryKey: ["logs"] })),
      api.sockets.config.onConfigUpdated(() => queryClient.invalidateQueries({ queryKey: ["config"] })),
    ];

    return () => {
      subscriptions.forEach((unsubscribe) => unsubscribe());
    };
  }, [api, queryClient, selectedSessionId]);

  const createSessionMutation = useMutation({
    mutationFn: (input: CreateChatSessionDto) => api.http.chatSessions.create(input),
    onSuccess: (session) => {
      setSessionForm({ title: "", description: "" });
      setSelectedSessionId(session.id);
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
    },
  });

  const createMessageMutation = useMutation({
    mutationFn: async (input: { sessionId: string; body: CreateChatMessageDto }) => {
      await api.http.chatSessions.createMessage(input.sessionId, input.body);
    },
    onSuccess: (_, variables) => {
      setMessageDraft("");
      queryClient.invalidateQueries({
        queryKey: ["chat-sessions", variables.sessionId, "messages"],
      });
    },
  });

  const emitLogMutation = useMutation({
    mutationFn: () => api.http.logs.emit(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["logs"] });
    },
  });

  const toggleThemeMutation = useMutation({
    mutationFn: (theme: RuntimeConfigDto["theme"]) => api.http.config.update({ theme }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
  });

  const activeSession = useMemo<ChatSessionDto | null>(() => {
    if (!selectedSessionId) {
      return null;
    }
    return sessionsQuery.data?.find((session) => session.id === selectedSessionId) ?? null;
  }, [selectedSessionId, sessionsQuery.data]);

  const handleCreateSession = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!sessionForm.title.trim()) {
      return;
    }
    createSessionMutation.mutate({
      title: sessionForm.title.trim(),
      description: sessionForm.description.trim() || undefined,
    });
  };

  const handleSendMessage = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!selectedSessionId || !messageDraft.trim()) {
      return;
    }
    createMessageMutation.mutate({
      sessionId: selectedSessionId,
      body: {
        role: "user" as CreateChatMessageDto["role"],
        content: messageDraft.trim(),
      },
    });
  };

  const handleToggleTheme = (): void => {
    const currentTheme = configQuery.data?.theme ?? "dark";
    toggleThemeMutation.mutate(currentTheme === "dark" ? "light" : "dark");
  };

  const renderMessages = (messages: ChatMessageDto[]): JSX.Element => (
    <ScrollArea
      type="always"
      className="h-64 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_25px_60px_-45px_rgba(16,185,129,0.65)]"
    >
      <Flex direction="column" gap="3">
        {messages.length === 0 ? (
          <Text size="2" color="gray">
            No messages yet. Send the first message to kick off the session.
          </Text>
        ) : (
          messages.map((message) => (
            <Flex
              key={message.id}
              direction="column"
              className="rounded-2xl border border-white/5 bg-gradient-to-br from-emerald-500/15 via-slate-900/60 to-sky-500/10 p-3 shadow-inner"
            >
              <Text size="1" color="gray" weight="medium" className="tracking-wide">
                {message.role.toUpperCase()} • {new Date(message.createdAt).toLocaleTimeString()}
              </Text>
              <Text size="2" className="leading-relaxed text-foreground">
                {message.content}
              </Text>
            </Flex>
          ))
        )}
      </Flex>
    </ScrollArea>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_rgba(15,23,42,0.95)_70%)]" />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 p-8 shadow-[0_55px_110px_-65px_rgba(16,185,129,0.85)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.35),_transparent_70%)]" />
          <div className="relative flex flex-col gap-8">
            <Flex
              direction={{ initial: "column", md: "row" }}
              align={{ initial: "start", md: "center" }}
              justify="between"
              className="gap-8"
            >
              <div className="space-y-4 text-balance">
                <Heading size="7" weight="bold" className="text-white">
                  Command the Eddie control surface with confidence
                </Heading>
                <Text size="3" color="gray">
                  Monitor live sessions, inspect traces, and tune runtime behaviour with a cinematic dashboard
                  designed for high-signal operator workflows.
                </Text>
              </div>
              <Button asChild size="3" variant="solid" color="jade">
                <a
                  href="https://github.com/Teagan42/Eddie"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold"
                >
                  Explore the docs
                </a>
              </Button>
            </Flex>

            <Grid columns={{ initial: "1", sm: "3" }} gap="4">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="group/stat relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_35px_80px_-60px_rgba(16,185,129,0.8)] transition-colors duration-500 hover:border-emerald-400/40 hover:bg-emerald-500/10"
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.3),_transparent_65%)] opacity-0 transition-opacity duration-500 group-hover/stat:opacity-100" />
                  <div className="relative flex h-full flex-col gap-4">
                    <span className="text-3xl" aria-hidden="true">
                      {stat.accent}
                    </span>
                    <Heading as="h3" size="5" className="text-white">
                      {stat.value.toLocaleString()}
                    </Heading>
                    <Text size="2" className="font-medium text-foreground/80">
                      {stat.label}
                    </Text>
                    <Text size="1" color="gray">
                      {stat.hint}
                    </Text>
                  </div>
                </div>
              ))}
            </Grid>
          </div>
        </section>

        <Grid gap="6">
          <Panel
            title="Authentication"
            description="Provide an Eddie API key to unlock administrative surfaces"
          >
            <Flex gap="3" align="center" wrap="wrap">
              <TextField.Root
                placeholder="Enter API key"
                value={apiKey ?? ""}
                onChange={(event) => setApiKey(event.target.value || null)}
                className="w-full md:w-auto md:min-w-[320px]"
                variant="surface"
              />
              <Text size="2" color="gray">
                Keys are stored locally in your browser.
              </Text>
            </Flex>
          </Panel>
          <Grid columns={{ initial: "1", md: "2" }} gap="6">
            <Panel
              title="Chat Sessions"
              description="Inspect and collaborate on control plane sessions"
              actions={
                <form onSubmit={handleCreateSession} className="flex items-center gap-2">
                  <TextField.Root
                    size="2"
                    placeholder="Session title"
                    value={sessionForm.title}
                    onChange={(event) =>
                      setSessionForm((prev) => ({ ...prev, title: event.target.value }))
                    }
                    required
                  />
                  <IconButton type="submit" variant="solid" color="jade" disabled={createSessionMutation.isPending}>
                    <PlusIcon />
                  </IconButton>
                </form>
              }
            >
              <Grid columns={{ initial: "1", md: "2" }} gap="4">
                <ScrollArea
                  type="always"
                  className="h-72 rounded-2xl border border-white/10 bg-white/5 p-3 shadow-[0_25px_60px_-45px_rgba(16,185,129,0.65)]"
                >
                  <Flex direction="column" gap="2" p="2">
                    {sessionsQuery.data?.length ? (
                      sessionsQuery.data.map((session) => (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => setSelectedSessionId(session.id)}
                          className={`group/session relative overflow-hidden rounded-2xl border px-4 py-3 text-left transition-all ${
                            session.id === selectedSessionId
                              ? "border-emerald-400/60 bg-emerald-500/15 text-foreground shadow-[0_15px_30px_-25px_rgba(16,185,129,0.9)]"
                              : "border-white/5 bg-white/0 text-foreground/80 hover:border-emerald-400/40 hover:bg-emerald-500/10"
                          }`}
                        >
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/25 via-transparent to-sky-500/25 opacity-0 transition-opacity duration-500 group-hover/session:opacity-100" />
                          <Heading as="h3" size="2" weight="medium">
                            {session.title}
                          </Heading>
                          <Text size="1" color="gray">
                            Updated {new Date(session.updatedAt).toLocaleTimeString()}
                          </Text>
                        </button>
                      ))
                    ) : (
                      <Text size="2" color="gray">
                        No sessions yet. Create one to get started.
                      </Text>
                    )}
                  </Flex>
                </ScrollArea>

                <Flex direction="column" gap="4">
                  <Heading as="h3" size="4" className="text-white">
                    {activeSession?.title ?? "Select a session"}
                  </Heading>
                  {messagesQuery.isLoading ? (
                    <Text size="2" color="gray">
                      Loading messages…
                    </Text>
                  ) : messagesQuery.data ? (
                    renderMessages(messagesQuery.data)
                  ) : null}

                  <form onSubmit={handleSendMessage} className="flex flex-col gap-3">
                    <TextArea
                      placeholder="Send a message"
                      value={messageDraft}
                      onChange={(event) => setMessageDraft(event.target.value)}
                      disabled={!selectedSessionId || createMessageMutation.isPending}
                      rows={3}
                      className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                    />
                    <Flex gap="2" justify="end">
                      <Button
                        type="submit"
                        size="2"
                        disabled={!selectedSessionId || createMessageMutation.isPending}
                        color="jade"
                      >
                        <PaperPlaneIcon /> Send
                      </Button>
                    </Flex>
                  </form>
                </Flex>
              </Grid>
            </Panel>

            <Panel title="Traces" description="Real-time observability into orchestrated workloads">
              {tracesQuery.isLoading ? (
                <Text size="2" color="gray">
                  Loading traces…
                </Text>
              ) : tracesQuery.data?.length ? (
                <ScrollArea
                  type="always"
                  className="h-72 rounded-2xl border border-white/10 bg-white/5 p-3 shadow-[0_25px_60px_-45px_rgba(16,185,129,0.65)]"
                >
                  <Flex direction="column" gap="3" p="2">
                    {tracesQuery.data.map((trace) => (
                      <Flex
                        key={trace.id}
                        direction="column"
                        className="rounded-2xl border border-white/5 bg-gradient-to-br from-emerald-500/10 via-slate-900/60 to-sky-500/10 p-3"
                      >
                        <Text size="1" color="gray" className="tracking-wide">
                          {trace.name} • {trace.status.toUpperCase()}
                        </Text>
                        <Text size="2" className="text-foreground">
                          Duration: {trace.durationMs ? `${trace.durationMs}ms` : "pending"}
                        </Text>
                      </Flex>
                    ))}
                  </Flex>
                </ScrollArea>
              ) : (
                <Text size="2" color="gray">
                  No traces emitted yet.
                </Text>
              )}
            </Panel>
          </Grid>

          <Grid columns={{ initial: "1", md: "2" }} gap="6">
            <Panel
              title="Logs"
              description="Live stream of structured telemetry entries"
              actions={
                <Button
                  size="2"
                  variant="soft"
                  color="jade"
                  onClick={() => emitLogMutation.mutate()}
                  disabled={emitLogMutation.isPending}
                >
                  <ReloadIcon /> Emit
                </Button>
              }
            >
              {logsQuery.isLoading ? (
                <Text size="2" color="gray">
                  Loading logs…
                </Text>
              ) : logsQuery.data?.length ? (
                <ScrollArea
                  type="always"
                  className="h-72 rounded-2xl border border-white/10 bg-white/5 p-3 shadow-[0_25px_60px_-45px_rgba(16,185,129,0.65)]"
                >
                  <Flex direction="column" gap="3" p="2">
                    {logsQuery.data.map((entry) => (
                      <Flex
                        key={entry.id}
                        direction="column"
                        className="rounded-2xl border border-white/5 bg-gradient-to-br from-emerald-500/10 via-slate-900/60 to-sky-500/10 p-3"
                      >
                        <Text size="1" color="gray" className="tracking-wide">
                          {entry.level.toUpperCase()} • {new Date(entry.createdAt).toLocaleTimeString()}
                        </Text>
                        <Text size="2" className="text-foreground">
                          {entry.message}
                        </Text>
                      </Flex>
                    ))}
                  </Flex>
                </ScrollArea>
              ) : (
                <Text size="2" color="gray">
                  Awaiting log entries.
                </Text>
              )}
            </Panel>

            <Panel
              title="Runtime Config"
              description="Adjust live settings for connected dashboards"
              actions={
                <Button size="2" variant="soft" color="jade" onClick={handleToggleTheme}>
                  Toggle theme
                </Button>
              }
            >
              {configQuery.isLoading ? (
                <Text size="2" color="gray">
                  Loading configuration…
                </Text>
              ) : configQuery.data ? (
                <Flex direction="column" gap="3">
                  <Text size="2">API URL: {configQuery.data.apiUrl}</Text>
                  <Text size="2">WebSocket URL: {configQuery.data.websocketUrl}</Text>
                  <Text size="2">Theme: {configQuery.data.theme}</Text>
                  <Flex gap="2" wrap="wrap">
                    {Object.entries(configQuery.data.features).map(([feature, enabled]) => (
                      <Text
                        key={feature}
                        size="1"
                        className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide ${
                          enabled
                            ? "border-emerald-400/60 bg-emerald-500/10 text-foreground"
                            : "border-white/10 bg-white/5 text-foreground/60"
                        }`}
                      >
                        {feature}
                      </Text>
                    ))}
                  </Flex>
                </Flex>
              ) : (
                <Text size="2" color="gray">
                  Unable to load configuration.
                </Text>
              )}
            </Panel>
          </Grid>
        </Grid>
      </div>
    </div>
*/
  );
}

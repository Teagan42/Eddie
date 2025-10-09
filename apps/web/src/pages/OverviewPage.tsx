import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Flex, Grid, Heading, IconButton, ScrollArea, Text, TextArea, TextField } from "@radix-ui/themes";
import { PaperPlaneIcon, PlusIcon, ReloadIcon } from "@radix-ui/react-icons";
import { clsx } from "clsx";
import { Panel } from "@/components/panel";
import { useAuth } from "@/auth/auth-context";
import { useApi } from "@/api/api-provider";
import type {
  ChatMessageDto,
  ChatSessionDto,
  CreateChatMessageDto,
  CreateChatSessionDto,
  RuntimeConfigDto,
} from "@eddie/api-client";

interface SessionFormState {
  title: string;
  description: string;
}

export function OverviewPage(): JSX.Element {
  const { apiKey, setApiKey } = useAuth();
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

  const stats = useMemo(
    () => [
      {
        label: "Chat sessions",
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
      className="h-64 rounded-3xl border border-white/10 bg-slate-950/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
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
              className="rounded-2xl border border-white/5 bg-white/5 p-4 shadow-[0_25px_50px_-35px_rgba(56,189,248,0.45)]"
            >
              <Text size="1" color="gray" weight="medium" className="uppercase tracking-wide">
                {message.role.toUpperCase()} • {new Date(message.createdAt).toLocaleTimeString()}
              </Text>
              <Text size="2" className="text-foreground/95">
                {message.content}
              </Text>
            </Flex>
          ))
        )}
      </Flex>
    </ScrollArea>
  );

  return (
    <div className="relative z-10 flex flex-col gap-8 px-6 py-12">
      <section className="relative overflow-hidden rounded-[2.75rem] border border-white/10 bg-slate-950/70 p-10 shadow-[0_70px_120px_-70px_rgba(56,189,248,0.65)]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-emerald-400/20 blur-[160px]" />
          <div className="absolute -bottom-32 right-1/5 h-80 w-80 rounded-full bg-sky-500/20 blur-[180px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.15),_transparent_65%)]" />
        </div>
        <div className="relative z-10 flex flex-col gap-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-emerald-200/80">
                Agentic mission control
              </p>
              <Heading size="8" weight="medium" className="gradient-text">
                Monitor, orchestrate, and fine-tune Eddie in real time
              </Heading>
              <Text size="3" color="gray" className="max-w-2xl text-foreground/70">
                This dashboard keeps every orchestrator heartbeat, telemetry stream, and runtime toggle within reach. Draft
                sessions, replay messages, and triage traces from one luminous surface.
              </Text>
            </div>
            <div className="flex flex-col items-start gap-3 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_35px_80px_-45px_rgba(56,189,248,0.55)]">
              <Text size="2" color="gray" className="uppercase tracking-[0.35em] text-emerald-200/80">
                Theme
              </Text>
              <Heading size="5">{(configQuery.data?.theme ?? "dark").toUpperCase()}</Heading>
              <Button
                size="3"
                onClick={handleToggleTheme}
                variant="solid"
                color="jade"
                disabled={toggleThemeMutation.isPending}
                className="shadow-[0_25px_45px_-25px_rgba(16,185,129,0.85)]"
              >
                Toggle theme
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-[0_28px_60px_-40px_rgba(56,189,248,0.4)] transition-transform duration-500 hover:-translate-y-1 hover:shadow-[0_40px_90px_-45px_rgba(139,92,246,0.45)]"
              >
                <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                  <div className="absolute -top-16 right-0 h-32 w-32 rounded-full bg-emerald-400/30 blur-[120px]" />
                </div>
                <div className="relative z-10 space-y-2">
                  <span className="text-2xl">{stat.accent}</span>
                  <p className="text-xs uppercase tracking-[0.4em] text-white/60">{stat.label}</p>
                  <p className="text-4xl font-semibold text-white">{stat.value}</p>
                  <p className="text-sm text-foreground/70">{stat.hint}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Panel
        title="Authentication"
        description="Provide an Eddie API key to unlock administrative surfaces"
        className="shadow-[0_60px_140px_-80px_rgba(56,189,248,0.65)]"
      >
        <Flex gap="3" align="center" wrap="wrap">
          <TextField.Root
            placeholder="Enter API key"
            value={apiKey ?? ""}
            onChange={(event) => setApiKey(event.target.value || null)}
            className="w-full rounded-2xl border border-white/10 bg-white/5 text-white shadow-[0_25px_60px_-35px_rgba(56,189,248,0.5)] transition-all duration-300 focus-within:border-emerald-400/70 focus-within:shadow-[0_30px_75px_-40px_rgba(16,185,129,0.7)] md:w-auto md:min-w-[320px]"
            variant="surface"
          />
          <Text size="2" color="gray">
            Keys are stored locally in your browser.
          </Text>
        </Flex>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Chat Sessions"
          description="Inspect and collaborate on control plane sessions"
          actions={
            <form onSubmit={handleCreateSession} className="flex items-center gap-3">
              <TextField.Root
                size="2"
                placeholder="Session title"
                value={sessionForm.title}
                onChange={(event) =>
                  setSessionForm((prev) => ({ ...prev, title: event.target.value }))
                }
                className="min-w-[220px] rounded-2xl border border-white/10 bg-white/5 text-white focus-within:border-emerald-400/70"
                required
              />
              <IconButton
                type="submit"
                variant="solid"
                color="jade"
                disabled={createSessionMutation.isPending}
                className="shadow-[0_20px_45px_-25px_rgba(16,185,129,0.85)]"
              >
                <PlusIcon />
              </IconButton>
            </form>
          }
        >
          <Grid columns={{ initial: "1", md: "2" }} gap="4">
            <ScrollArea
              type="always"
              className="h-72 rounded-3xl border border-white/10 bg-slate-950/50"
            >
              <Flex direction="column" gap="3" p="4">
                {sessionsQuery.data?.length ? (
                  sessionsQuery.data.map((session) => {
                    const isActive = session.id === selectedSessionId;
                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => setSelectedSessionId(session.id)}
                        className={clsx(
                          "group relative overflow-hidden rounded-2xl border px-4 py-3 text-left transition-all duration-300",
                          isActive
                            ? "border-emerald-400/60 bg-emerald-400/10 shadow-[0_25px_65px_-35px_rgba(16,185,129,0.75)]"
                            : "border-white/5 bg-white/5 hover:border-emerald-400/40 hover:bg-emerald-400/5"
                        )}
                      >
                        <span className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                          <span className="absolute inset-0 bg-gradient-to-r from-emerald-400/20 to-sky-500/10 blur-2xl" />
                        </span>
                        <Heading as="h3" size="3" weight="medium" className="text-white">
                          {session.title}
                        </Heading>
                        <Text size="1" color="gray">
                          Updated {new Date(session.updatedAt).toLocaleTimeString()}
                        </Text>
                      </button>
                    );
                  })
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
                  className="rounded-2xl border border-white/10 bg-slate-950/60 text-foreground/90 shadow-[0_25px_60px_-40px_rgba(56,189,248,0.55)] focus:border-emerald-400/60"
                />
                <Flex gap="2" justify="end">
                  <Button
                    type="submit"
                    size="3"
                    disabled={!selectedSessionId || createMessageMutation.isPending}
                    color="jade"
                    className="shadow-[0_25px_55px_-30px_rgba(16,185,129,0.85)]"
                  >
                    <PaperPlaneIcon /> Send
                  </Button>
                </Flex>
              </form>
            </Flex>
          </Grid>
        </Panel>

        <Panel
          title="Traces"
          description="Real-time observability into orchestrated workloads"
          className="shadow-[0_55px_120px_-80px_rgba(56,189,248,0.55)]"
        >
          {tracesQuery.isLoading ? (
            <Text size="2" color="gray">
              Loading traces…
            </Text>
          ) : tracesQuery.data?.length ? (
            <ScrollArea
              type="always"
              className="h-72 rounded-3xl border border-white/10 bg-slate-950/55"
            >
              <Flex direction="column" gap="3" p="4">
                {tracesQuery.data.map((trace) => (
                  <Flex
                    key={trace.id}
                    direction="column"
                    className="rounded-2xl border border-white/5 bg-white/5 p-4 shadow-[0_25px_60px_-40px_rgba(56,189,248,0.45)]"
                  >
                    <Text size="1" color="gray" className="uppercase tracking-wide">
                      {trace.name} • {trace.status.toUpperCase()}
                    </Text>
                    <Text size="2" className="text-foreground/95">
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
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Logs"
          description="Live stream of structured telemetry entries"
          actions={
            <Button
              size="3"
              variant="soft"
              color="jade"
              onClick={() => emitLogMutation.mutate()}
              disabled={emitLogMutation.isPending}
              className="shadow-[0_25px_55px_-30px_rgba(16,185,129,0.8)]"
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
              className="h-72 rounded-3xl border border-white/10 bg-slate-950/55"
            >
              <Flex direction="column" gap="3" p="4">
                {logsQuery.data.map((entry) => (
                  <Flex
                    key={entry.id}
                    direction="column"
                    className="rounded-2xl border border-white/5 bg-white/5 p-4 shadow-[0_25px_60px_-40px_rgba(56,189,248,0.45)]"
                  >
                    <Text size="1" color="gray" className="uppercase tracking-wide">
                      {entry.level.toUpperCase()} • {new Date(entry.createdAt).toLocaleTimeString()}
                    </Text>
                    <Text size="2" className="text-foreground/95">
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
          className="shadow-[0_55px_120px_-80px_rgba(139,92,246,0.45)]"
        >
          {configQuery.isLoading ? (
            <Text size="2" color="gray">
              Loading configuration…
            </Text>
          ) : configQuery.data ? (
            <Flex direction="column" gap="4">
              <Text size="2" className="text-foreground/85">
                API URL: {configQuery.data.apiUrl}
              </Text>
              <Text size="2" className="text-foreground/85">
                WebSocket URL: {configQuery.data.websocketUrl}
              </Text>
              <Text size="2" className="text-foreground/85">
                Theme: {configQuery.data.theme}
              </Text>
              <Flex gap="2" wrap="wrap">
                {Object.entries(configQuery.data.features).map(([feature, enabled]) => (
                  <Text
                    key={feature}
                    size="1"
                    className={clsx(
                      "rounded-full px-4 py-1 text-xs uppercase tracking-[0.3em]",
                      enabled
                        ? "bg-emerald-400/20 text-emerald-200"
                        : "bg-white/10 text-white/60"
                    )}
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
      </div>
    </div>
  );
}

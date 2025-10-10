import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  IconButton,
  ScrollArea,
  Separator,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { PaperPlaneIcon, PlusIcon, ReloadIcon } from "@radix-ui/react-icons";
import { ArrowUpRight, KeyRound, Sparkles, Waves } from "lucide-react";
import { Panel } from "@/components/panel";
import { useAuth } from "@/auth/auth-context";
import { useApi } from "@/api/api-provider";
import { cn } from "@/components/lib/utils";
import type {
  ChatMessageDto,
  ChatSessionDto,
  CreateChatMessageDto,
  CreateChatSessionDto,
  LogEntryDto,
  RuntimeConfigDto,
} from "@eddie/api-client";

interface SessionFormState {
  title: string;
  description: string;
}

type StatItem = {
  label: string;
  value: number;
  hint: string;
  icon: ComponentType<{ className?: string }>;
};

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

  const stats = useMemo<StatItem[]>(
    () => [
      {
        label: "Active Sessions",
        value: sessionsQuery.data?.length ?? 0,
        hint: "Collaboration threads in motion",
        icon: Sparkles,
      },
      {
        label: "Live Traces",
        value: tracesQuery.data?.length ?? 0,
        hint: "Streaming observability signals",
        icon: Waves,
      },
      {
        label: "Log Entries",
        value: logsQuery.data?.length ?? 0,
        hint: "Latest structured telemetry",
        icon: ArrowUpRight,
      },
    ],
    [logsQuery.data?.length, sessionsQuery.data?.length, tracesQuery.data?.length]
  );

  const mergeLogsIntoCache = useCallback((incoming: LogEntryDto | LogEntryDto[]): void => {
    const batch = Array.isArray(incoming) ? incoming : [incoming];
    if (batch.length === 0) {
      return;
    }

    queryClient.setQueryData<LogEntryDto[]>(["logs"], (current = []) => {
      if (current.length === 0) {
        return batch;
      }

      const next = [...current];
      const indexById = new Map(current.map((entry, index) => [entry.id, index]));

      for (const entry of batch) {
        const existingIndex = indexById.get(entry.id);
        if (existingIndex !== undefined) {
          next[existingIndex] = entry;
        } else {
          indexById.set(entry.id, next.length);
          next.push(entry);
        }
      }

      return next;
    });
  }, [queryClient]);

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
      api.sockets.chatSessions.onMessageUpdated((message) =>
        queryClient.invalidateQueries({
          queryKey: ["chat-sessions", message.sessionId, "messages"],
        })
      ),
      api.sockets.traces.onTraceCreated(() => queryClient.invalidateQueries({ queryKey: ["traces"] })),
      api.sockets.traces.onTraceUpdated(() => queryClient.invalidateQueries({ queryKey: ["traces"] })),
      api.sockets.logs.onLogCreated((entry) => mergeLogsIntoCache(entry)),
      api.sockets.config.onConfigUpdated(() => queryClient.invalidateQueries({ queryKey: ["config"] })),
    ];

    return () => {
      subscriptions.forEach((unsubscribe) => unsubscribe());
    };
  }, [api, mergeLogsIntoCache, queryClient, selectedSessionId]);

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
    onSuccess: (entry) => {
      mergeLogsIntoCache(entry);
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
    <ScrollArea type="always" className="relative h-64 overflow-hidden rounded-2xl border border-white/15 bg-white/12 p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),transparent_65%)]" aria-hidden />
      <Flex direction="column" gap="3" className="relative z-10">
        {messages.length === 0 ? (
          <Text size="2" color="gray">
            No messages yet. Send the first message to kick off the session.
          </Text>
        ) : (
          messages.map((message, index) => (
            <Flex
              key={message.id}
              direction="column"
              className="relative gap-2 rounded-2xl border border-white/15 bg-slate-900/55 p-4 shadow-[0_25px_65px_-55px_rgba(59,130,246,0.7)]"
            >
              <Flex align="center" justify="between" className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  {message.role}
                </span>
                <span className="text-[0.7rem] text-white/70">
                  {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </Flex>
              <Text size="2" className="text-white/90">
                {message.content}
              </Text>
              <span className="pointer-events-none absolute -left-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-2xl md:block" aria-hidden />
              <Badge radius="full" variant="soft" color="grass" className="self-start text-[0.65rem] uppercase tracking-wider">
                #{index + 1}
              </Badge>
            </Flex>
          ))
        )}
      </Flex>
    </ScrollArea>
  );

  return (
    <Flex direction="column" gap="8">
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
                onClick={handleToggleTheme}
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
                {configQuery.data?.apiUrl ?? "Awaiting configuration"}
              </Text>
              {apiKey ? (
                <Button
                  size="2"
                  variant="surface"
                  color="red"
                  onClick={() => setApiKey(null)}
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
        <Grid columns={{ initial: "1", sm: "3" }} gap="4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Box
                key={stat.label}
                className="group relative overflow-hidden rounded-3xl border border-white/15 bg-white/12 p-6 shadow-[0_35px_70px_-55px_rgba(56,189,248,0.75)]"
              >
                <div className="absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100 [background:radial-gradient(circle_at_top,_rgba(74,222,128,0.25),transparent_65%)]" />
                <Flex align="center" justify="between" className="mb-3">
                  <Flex align="center" gap="3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900/50">
                      <Icon className="h-5 w-5 text-emerald-200" />
                    </span>
                    <Text size="1" color="gray" className="uppercase tracking-[0.3em]">
                      {stat.label}
                    </Text>
                  </Flex>
                  <Badge variant="soft" color="grass">
                    Live
                  </Badge>
                </Flex>
                <Heading size="7" className="text-white">
                  {stat.value}
                </Heading>
                <Text size="2" color="gray">
                  {stat.hint}
                </Text>
              </Box>
            );
          })}
        </Grid>
      </Box>

      <Panel
        title="Authentication"
        description="Provide an Eddie API key to unlock administrative surfaces"
        className="scroll-mt-24"
        id="authentication"
      >
        <Flex direction="column" gap="4">
          <Text size="2" color="gray">
            Paste your Eddie API key to unlock live orchestration tools.
          </Text>
          <Flex gap="3" align="center" wrap="wrap">
            <TextField.Root
              placeholder="Enter API key"
              value={apiKey ?? ""}
              onChange={(event) => setApiKey(event.target.value || null)}
              className="w-full md:w-auto md:min-w-[320px]"
              variant="surface"
            />
            <Badge color="grass" variant="soft">
              Secure & Local Only
            </Badge>
          </Flex>
        </Flex>
      </Panel>

      <Grid columns={{ initial: "1", xl: "2" }} gap="6">
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
          <Grid columns={{ initial: "1", md: "2" }} gap="5">
            <ScrollArea type="always" className="h-80 rounded-2xl border border-white/15 bg-slate-900/35 p-3">
              <Flex direction="column" gap="2">
                {sessionsQuery.data?.length ? (
                  sessionsQuery.data.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => setSelectedSessionId(session.id)}
                      className={cn(
                        "rounded-2xl border border-white/10 px-4 py-3 text-left transition-all",
                        session.id === selectedSessionId
                          ? "bg-emerald-500/25 text-white shadow-[0_18px_45px_-28px_rgba(16,185,129,0.8)]"
                          : "bg-white/10 text-white/80 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-emerald-500/20 hover:text-white"
                      )}
                    >
                      <Heading as="h3" size="3" weight="medium">
                        {session.title}
                      </Heading>
                      <Text size="1" color="gray">
                        Updated {new Date(session.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
                  className="rounded-2xl border border-white/15 bg-white/12"
                />
                <Flex gap="2" justify="end">
                  <Button
                    type="submit"
                    size="3"
                    disabled={!selectedSessionId || createMessageMutation.isPending}
                    className="bg-gradient-to-r from-emerald-400 via-emerald-500 to-sky-500 text-white"
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
            <ScrollArea type="always" className="h-80 rounded-2xl border border-white/15 bg-slate-900/35 p-4">
              <Flex direction="column" gap="3">
                {tracesQuery.data.map((trace) => (
                  <Flex
                    key={trace.id}
                    direction="column"
                    className="rounded-2xl border border-white/10 bg-white/12 p-4"
                  >
                    <Flex align="center" justify="between">
                      <Text size="2" weight="medium">
                        {trace.name}
                      </Text>
                      <Badge color={trace.status === "failed" ? "red" : "grass"} variant="solid">
                        {trace.status.toUpperCase()}
                      </Badge>
                    </Flex>
                    <Text size="1" color="gray">
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

      <Grid columns={{ initial: "1", xl: "2" }} gap="6">
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
            <ScrollArea type="always" className="h-80 rounded-2xl border border-white/15 bg-slate-900/35 p-4">
              <Flex direction="column" gap="3">
                {logsQuery.data.map((entry) => (
                  <Flex
                    key={entry.id}
                    direction="column"
                    className="rounded-2xl border border-white/10 bg-white/12 p-4"
                  >
                    <Flex align="center" justify="between">
                      <Text size="1" color="gray">
                        {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </Text>
                      <Badge color={entry.level === "error" ? "red" : "grass"} variant="surface">
                        {entry.level.toUpperCase()}
                      </Badge>
                    </Flex>
                    <Text size="2">{entry.message}</Text>
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
            <Flex direction="column" gap="4">
              <Box className="rounded-2xl border border-white/10 bg-white/12 p-4">
                <Text size="1" color="gray">
                  API URL
                </Text>
                <Text size="2" className="font-mono text-emerald-100">
                  {configQuery.data.apiUrl}
                </Text>
              </Box>
              <Box className="rounded-2xl border border-white/10 bg-white/12 p-4">
                <Text size="1" color="gray">
                  WebSocket URL
                </Text>
                <Text size="2" className="font-mono text-emerald-100">
                  {configQuery.data.websocketUrl}
                </Text>
              </Box>
              <Flex align="center" justify="between">
                <Text size="2">Theme</Text>
                <Badge variant="surface" color="grass">
                  {configQuery.data.theme}
                </Badge>
              </Flex>
              <Separator className="border-white/10" />
              <Flex gap="2" wrap="wrap">
                {Object.entries(configQuery.data.features).map(([feature, enabled]) => (
                  <Badge
                    key={feature}
                    variant={enabled ? "solid" : "soft"}
                    color={enabled ? "grass" : "gray"}
                    className="uppercase tracking-wide"
                  >
                    {feature}
                  </Badge>
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
    </Flex>
  );
}

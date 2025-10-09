import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Flex, Grid, Heading, IconButton, ScrollArea, Text, TextArea, TextField } from "@radix-ui/themes";
import { PaperPlaneIcon, PlusIcon, ReloadIcon } from "@radix-ui/react-icons";
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
    <ScrollArea type="always" className="h-64 rounded-lg border border-muted/40 bg-black/10 p-3">
      <Flex direction="column" gap="3">
        {messages.length === 0 ? (
          <Text size="2" color="gray">
            No messages yet. Send the first message to kick off the session.
          </Text>
        ) : (
          messages.map((message) => (
            <Flex key={message.id} direction="column" className="rounded-lg bg-muted/20 p-3">
              <Text size="1" color="gray" weight="medium">
                {message.role.toUpperCase()} • {new Date(message.createdAt).toLocaleTimeString()}
              </Text>
              <Text size="2">{message.content}</Text>
            </Flex>
          ))
        )}
      </Flex>
    </ScrollArea>
  );

  return (
    <Grid gap="5" className="mx-auto max-w-6xl px-6 py-10">
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

      <Grid columns={{ initial: "1", md: "2" }} gap="5">
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
            <ScrollArea type="always" className="h-72 rounded-lg border border-muted/30 bg-black/5">
              <Flex direction="column" gap="2" p="3">
                {sessionsQuery.data?.length ? (
                  sessionsQuery.data.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => setSelectedSessionId(session.id)}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        session.id === selectedSessionId
                          ? "border-accent/80 bg-accent/20 text-foreground"
                          : "border-transparent bg-transparent text-foreground/80 hover:border-accent/40 hover:bg-accent/10"
                      }`}
                    >
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

            <Flex direction="column" gap="3">
              <Heading as="h3" size="3">
                {activeSession?.title ?? "Select a session"}
              </Heading>
              {messagesQuery.isLoading ? (
                <Text size="2" color="gray">
                  Loading messages…
                </Text>
              ) : messagesQuery.data ? (
                renderMessages(messagesQuery.data)
              ) : null}

              <form onSubmit={handleSendMessage} className="flex flex-col gap-2">
                <TextArea
                  placeholder="Send a message"
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  disabled={!selectedSessionId || createMessageMutation.isPending}
                  rows={3}
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
            <ScrollArea type="always" className="h-72 rounded-lg border border-muted/30 bg-black/5">
              <Flex direction="column" gap="2" p="3">
                {tracesQuery.data.map((trace) => (
                  <Flex key={trace.id} direction="column" className="rounded-lg bg-muted/20 p-3">
                    <Text size="1" color="gray">
                      {trace.name} • {trace.status.toUpperCase()}
                    </Text>
                    <Text size="2">
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

      <Grid columns={{ initial: "1", md: "2" }} gap="5">
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
            <ScrollArea type="always" className="h-72 rounded-lg border border-muted/30 bg-black/5">
              <Flex direction="column" gap="2" p="3">
                {logsQuery.data.map((entry) => (
                  <Flex key={entry.id} direction="column" className="rounded-lg bg-muted/20 p-3">
                    <Text size="1" color="gray">
                      {entry.level.toUpperCase()} • {new Date(entry.createdAt).toLocaleTimeString()}
                    </Text>
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
            <Flex direction="column" gap="3">
              <Text size="2">API URL: {configQuery.data.apiUrl}</Text>
              <Text size="2">WebSocket URL: {configQuery.data.websocketUrl}</Text>
              <Text size="2">Theme: {configQuery.data.theme}</Text>
              <Flex gap="2" wrap="wrap">
                {Object.entries(configQuery.data.features).map(([feature, enabled]) => (
                  <Text
                    key={feature}
                    size="1"
                    className={`rounded-full px-3 py-1 text-xs uppercase tracking-wide ${
                      enabled ? "bg-accent/30 text-foreground" : "bg-muted/30 text-foreground/60"
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
  );
}

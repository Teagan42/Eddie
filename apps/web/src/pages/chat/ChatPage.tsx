import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  IconButton,
  ScrollArea,
  SegmentedControl,
  Select,
  Text,
  TextArea,
  Tooltip,
} from "@radix-ui/themes";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PaperPlaneIcon,
  PlusIcon,
  ReloadIcon,
  RocketIcon,
} from "@radix-ui/react-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChatMessageDto,
  ChatSessionDto,
  CreateChatMessageDto,
  CreateChatSessionDto,
  OrchestratorMetadataDto,
} from "@eddie/api-client";
import { useApi } from "@/api/api-provider";
import { useLayoutPreferences } from "@/hooks/useLayoutPreferences";
import type { LayoutPreferencesDto } from "@eddie/api-client";
import { clsx } from "clsx";

const PROVIDER_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "OpenAI", value: "openai" },
  { label: "Anthropic", value: "anthropic" },
  { label: "Vertex", value: "vertex" },
  { label: "Custom", value: "custom" },
];

const MODEL_OPTIONS: Record<string, string[]> = {
  openai: ["gpt-4o", "o1-mini", "o3-mini"],
  anthropic: ["sonnet-3.5", "opus"],
  vertex: ["gemini-2.0-pro", "gemini-1.5-flash"],
  custom: ["manual"],
};

const PANEL_IDS = {
  context: "context-bundles",
  tools: "tool-tree",
  agents: "agent-hierarchy",
} as const;

type ChatPreferences = NonNullable<LayoutPreferencesDto["chat"]>;

type ComposerRole = CreateChatMessageDto["role"];

function sortSessions(sessions: ChatSessionDto[]): ChatSessionDto[] {
  return sessions
    .slice()
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
}

interface CollapsiblePanelProps {
  id: string;
  title: string;
  description?: string;
  collapsed: boolean;
  onToggle: (id: string, collapsed: boolean) => void;
  children: ReactNode;
}

function CollapsiblePanel({
  id,
  title,
  description,
  collapsed,
  onToggle,
  children,
}: CollapsiblePanelProps): JSX.Element {
  return (
    <Card
      className={clsx(
        "group relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/60 p-6 text-foreground/90",
        "shadow-[0_35px_80px_-55px_rgba(56,189,248,0.55)] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_50px_110px_-60px_rgba(139,92,246,0.45)]"
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -top-24 right-0 h-48 w-48 rounded-full bg-sky-500/20 blur-[150px]" />
        <div className="absolute -bottom-20 left-0 h-44 w-44 rounded-full bg-emerald-400/15 blur-[150px]" />
      </div>
      <div className="relative z-10 flex flex-col gap-4">
        <Flex align="center" justify="between" gap="3">
          <Box>
            <Heading as="h3" size="3" className="text-white">
              {title}
            </Heading>
            {description ? (
              <Text size="2" color="gray">
                {description}
              </Text>
            ) : null}
          </Box>
          <Tooltip content={collapsed ? "Expand" : "Collapse"}>
            <IconButton
              variant="soft"
              size="2"
              onClick={() => onToggle(id, !collapsed)}
              aria-label={collapsed ? "Expand panel" : "Collapse panel"}
              className="shadow-[0_18px_40px_-25px_rgba(56,189,248,0.55)]"
            >
              {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
            </IconButton>
          </Tooltip>
        </Flex>
        {!collapsed ? <Box className="text-sm text-foreground/90">{children}</Box> : null}
      </div>
    </Card>
  );
}

function ToolTree({ nodes }: { nodes: OrchestratorMetadataDto["toolInvocations"] }): JSX.Element {
  if (nodes.length === 0) {
    return (
      <Text size="2" color="gray">
        No tool calls recorded for this session yet.
      </Text>
    );
  }

  return (
    <ul className="space-y-2">
      {nodes.map((node) => (
        <li
          key={node.id}
          className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_18px_45px_-30px_rgba(56,189,248,0.45)]"
        >
          <Flex justify="between" align="center">
            <Text weight="medium" className="text-foreground">
              {node.name}
            </Text>
            <Badge color={node.status === "failed" ? "red" : "jade"} className="uppercase tracking-wide">
              {node.status.toUpperCase()}
            </Badge>
          </Flex>
          {node.metadata?.preview ? (
            <Text size="2" color="gray" className="text-foreground/80">
              {node.metadata.preview as string}
            </Text>
          ) : null}
          {node.children.length > 0 ? <ToolTree nodes={node.children} /> : null}
        </li>
      ))}
    </ul>
  );
}

function AgentTree({ nodes }: { nodes: OrchestratorMetadataDto["agentHierarchy"] }): JSX.Element {
  if (nodes.length === 0) {
    return (
      <Text size="2" color="gray">
        Orchestrator has not spawned any agents yet.
      </Text>
    );
  }

  return (
    <ul className="space-y-2">
      {nodes.map((node) => (
        <li
          key={node.id}
          className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_18px_45px_-30px_rgba(56,189,248,0.45)]"
        >
          <Flex direction="column" gap="2">
            <Text weight="medium" className="text-foreground">
              {node.name}
            </Text>
            <Text size="2" color="gray" className="text-foreground/80">
              {node.provider ?? "provider"} • {node.model ?? "model"}
            </Text>
            {node.children.length > 0 ? (
              <Box className="pl-4">
                <AgentTree nodes={node.children} />
              </Box>
            ) : null}
          </Flex>
        </li>
      ))}
    </ul>
  );
}

export function ChatPage(): JSX.Element {
  const api = useApi();
  const queryClient = useQueryClient();
  const { preferences, updatePreferences } = useLayoutPreferences();
  const [composerValue, setComposerValue] = useState("");
  const [composerRole, setComposerRole] = useState<ComposerRole>("user");
  const [templateSelection, setTemplateSelection] = useState<string>("");

  const sessionsQuery = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: () => api.http.chatSessions.list(),
  });

  const sessions = useMemo(
    () => sortSessions(sessionsQuery.data ?? []),
    [sessionsQuery.data]
  );

  const applyChatUpdate = useCallback(
    (
      updater: (
        current: ChatPreferences
      ) => ChatPreferences | void
    ) => {
      updatePreferences((previous) => {
        const base: ChatPreferences = {
          selectedSessionId: previous.chat?.selectedSessionId,
          collapsedPanels: { ...(previous.chat?.collapsedPanels ?? {}) },
          sessionSettings: { ...(previous.chat?.sessionSettings ?? {}) },
          templates: { ...(previous.chat?.templates ?? {}) },
        };
        const result = updater(base);
        const nextChat = result ?? base;
        return {
          ...previous,
          chat: nextChat,
          updatedAt: new Date().toISOString(),
        };
      });
    },
    [updatePreferences]
  );

  const selectedSessionId = useMemo(() => {
    if (preferences.chat?.selectedSessionId) {
      return preferences.chat.selectedSessionId;
    }
    return sessions[0]?.id ?? null;
  }, [preferences.chat?.selectedSessionId, sessions]);

  useEffect(() => {
    if (!preferences.chat?.selectedSessionId && sessions[0]?.id) {
      applyChatUpdate((chat) => ({ ...chat, selectedSessionId: sessions[0]!.id }));
    }
  }, [applyChatUpdate, preferences.chat?.selectedSessionId, sessions]);

  useEffect(() => {
    setComposerValue("");
    setComposerRole("user");
  }, [selectedSessionId]);

  const messagesQuery = useQuery({
    queryKey: ["chat-session", selectedSessionId, "messages"],
    enabled: Boolean(selectedSessionId),
    queryFn: () =>
      selectedSessionId
        ? api.http.chatSessions.listMessages(selectedSessionId)
        : Promise.resolve([]),
  });

  useEffect(() => {
    const unsubscribes = [
      api.sockets.chatSessions.onSessionCreated((session) => {
        queryClient.setQueryData<ChatSessionDto[]>(
          ["chat-sessions"],
          (previous = []) => sortSessions([session, ...previous.filter((item) => item.id !== session.id)])
        );
      }),
      api.sockets.chatSessions.onSessionUpdated((session) => {
        queryClient.setQueryData<ChatSessionDto[]>(
          ["chat-sessions"],
          (previous = []) =>
            sortSessions([
              session,
              ...previous.filter((item) => item.id !== session.id),
            ])
        );
      }),
      api.sockets.chatSessions.onMessageCreated((message) => {
        queryClient.setQueryData<ChatMessageDto[]>(
          ["chat-session", message.sessionId, "messages"],
          (previous = []) => {
            const next = previous.some((existing) => existing.id === message.id)
              ? previous
              : [...previous, message];
            return next.sort(
              (a, b) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
          }
        );
      }),
    ];

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [api, queryClient]);

  const orchestratorQuery = useQuery({
    queryKey: ["orchestrator-metadata", selectedSessionId],
    enabled: Boolean(selectedSessionId),
    queryFn: () =>
      selectedSessionId
        ? api.http.orchestrator.getMetadata(selectedSessionId)
        : Promise.resolve({
            contextBundles: [],
            toolInvocations: [],
            agentHierarchy: [],
          }),
    refetchInterval: 10_000,
  });

  const createSessionMutation = useMutation({
    mutationFn: (payload: CreateChatSessionDto) =>
      api.http.chatSessions.create(payload),
    onSuccess: (session) => {
      queryClient.setQueryData<ChatSessionDto[]>(
        ["chat-sessions"],
        (previous = []) => sortSessions([session, ...previous])
      );
      applyChatUpdate((chat) => ({ ...chat, selectedSessionId: session.id }));
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: (input: { sessionId: string; message: CreateChatMessageDto }) =>
      api.http.chatSessions.createMessage(input.sessionId, input.message),
    onSuccess: (message) => {
      setComposerValue("");
      queryClient.setQueryData<ChatMessageDto[]>(
        ["chat-session", message.sessionId, "messages"],
        (previous = []) => {
          const next = previous.some((existing) => existing.id === message.id)
            ? previous
            : [...previous, message];
          return next.sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        }
      );
    },
  });

  const collapsedPanels = preferences.chat?.collapsedPanels ?? {};
  const sessionSettings = preferences.chat?.sessionSettings ?? {};
  const templates = useMemo(
    () => preferences.chat?.templates ?? {},
    [preferences.chat?.templates]
  );

  const activeSettings = selectedSessionId
    ? sessionSettings[selectedSessionId] ?? {}
    : {};

  const selectedProvider = activeSettings.provider ?? PROVIDER_OPTIONS[0]?.value;
  const availableModels = MODEL_OPTIONS[selectedProvider] ?? MODEL_OPTIONS.custom;
  const selectedModel = activeSettings.model ?? availableModels[0];

  const messages = messagesQuery.data ?? [];
  const orchestratorMetadata: OrchestratorMetadataDto | null =
    orchestratorQuery.data ?? null;
  const providerLabel = useMemo(
    () =>
      PROVIDER_OPTIONS.find((option) => option.value === selectedProvider)?.label ??
      selectedProvider,
    [selectedProvider]
  );
  const activeSessionTitle = useMemo(
    () =>
      sessions.find((session) => session.id === selectedSessionId)?.title ?? "No session selected",
    [selectedSessionId, sessions]
  );
  const templateCount = useMemo(
    () => Object.keys(templates).length,
    [templates]
  );
  const messageCount = messages.length;

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (sessionId === selectedSessionId) {
        return;
      }
      applyChatUpdate((chat) => ({ ...chat, selectedSessionId: sessionId }));
    },
    [applyChatUpdate, selectedSessionId]
  );

  const handleSendMessage = useCallback(() => {
    if (!selectedSessionId || !composerValue.trim()) {
      return;
    }
    sendMessageMutation.mutate({
      sessionId: selectedSessionId,
      message: {
        role: composerRole,
        content: composerValue.trim(),
      },
    });
  }, [composerRole, composerValue, selectedSessionId, sendMessageMutation]);

  const handleProviderChange = useCallback(
    (value: string) => {
      if (!selectedSessionId) {
        return;
      }
      applyChatUpdate((chat) => {
        const nextSettings = { ...(chat.sessionSettings ?? {}) };
        nextSettings[selectedSessionId] = {
          provider: value,
          model: MODEL_OPTIONS[value]?.[0] ?? "manual",
        };
        return { ...chat, sessionSettings: nextSettings };
      });
    },
    [applyChatUpdate, selectedSessionId]
  );

  const handleModelChange = useCallback(
    (value: string) => {
      if (!selectedSessionId) {
        return;
      }
      applyChatUpdate((chat) => {
        const nextSettings = { ...(chat.sessionSettings ?? {}) };
        nextSettings[selectedSessionId] = {
          provider: selectedProvider,
          model: value,
        };
        return { ...chat, sessionSettings: nextSettings };
      });
    },
    [applyChatUpdate, selectedProvider, selectedSessionId]
  );

  const handleTogglePanel = useCallback(
    (panelId: string, collapsed: boolean) => {
      applyChatUpdate((chat) => {
        const nextPanels = { ...(chat.collapsedPanels ?? {}) };
        nextPanels[panelId] = collapsed;
        return { ...chat, collapsedPanels: nextPanels };
      });
    },
    [applyChatUpdate]
  );

  const handleSaveTemplate = useCallback(() => {
    if (!selectedSessionId || !composerValue.trim()) {
      return;
    }
    const name = window.prompt("Template name", "New template");
    if (!name) {
      return;
    }
    const templateId = `${selectedSessionId}-${Date.now()}`;
    const template = {
      id: templateId,
      name: name.trim(),
      provider: selectedProvider,
      model: selectedModel,
      prompt: composerValue,
      createdAt: new Date().toISOString(),
    };
    applyChatUpdate((chat) => {
      const nextTemplates = { ...(chat.templates ?? {}) };
      nextTemplates[templateId] = template;
      return { ...chat, templates: nextTemplates };
    });
  }, [applyChatUpdate, composerValue, selectedModel, selectedProvider, selectedSessionId]);

  const handleLoadTemplate = useCallback(
    (templateId: string) => {
      const template = templates[templateId];
      if (!template) {
        return;
      }
      setComposerValue(template.prompt);
      setComposerRole("user");
      if (selectedSessionId) {
        applyChatUpdate((chat) => {
          const nextSettings = { ...(chat.sessionSettings ?? {}) };
          nextSettings[selectedSessionId] = {
            provider: template.provider,
            model: template.model,
          };
          return { ...chat, sessionSettings: nextSettings };
        });
      }
    },
    [applyChatUpdate, selectedSessionId, templates]
  );

  const handleTemplateSelection = useCallback(
    (value: string) => {
      setTemplateSelection(value);
      handleLoadTemplate(value);
      setTemplateSelection("");
    },
    [handleLoadTemplate]
  );

  const handleCreateSession = useCallback(() => {
    const title = window.prompt("Session title", "New orchestrator session");
    if (!title?.trim()) {
      return;
    }
    const payload: CreateChatSessionDto = {
      title: title.trim(),
      description: "",
    };
    createSessionMutation.mutate(payload);
  }, [createSessionMutation]);

  const handleReissueCommand = useCallback(
    (message: ChatMessageDto) => {
      setComposerValue(message.content);
      setComposerRole(message.role as ComposerRole);
    },
    []
  );

  return (
    <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-12">
      <section className="relative overflow-hidden rounded-[2.75rem] border border-white/10 bg-slate-950/70 p-10 shadow-[0_70px_120px_-70px_rgba(56,189,248,0.65)]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-28 left-1/3 h-72 w-72 rounded-full bg-emerald-400/20 blur-[160px]" />
          <div className="absolute -bottom-32 right-1/4 h-80 w-80 rounded-full bg-sky-500/20 blur-[180px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_65%)]" />
        </div>
        <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-emerald-200/80">
              Orchestrator studio
            </p>
            <Heading size="8" weight="medium" className="gradient-text">
              Command the Eddie agent network
            </Heading>
            <Text size="3" color="gray" className="max-w-2xl text-foreground/70">
              Craft dialogues, orchestrate tool invocations, and monitor every agentic branch from a single cinematic console.
            </Text>
          </div>
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_35px_80px_-45px_rgba(56,189,248,0.55)]">
            <div className="space-y-2">
              <Text size="2" color="gray" className="uppercase tracking-[0.35em] text-emerald-200/80">
                Active session
              </Text>
              <Heading size="5" className="text-white">
                {activeSessionTitle}
              </Heading>
            </div>
            <Flex gap="2" wrap="wrap">
              <Badge variant="soft" color="jade" className="rounded-full bg-emerald-400/20 text-emerald-100 backdrop-blur">
                {providerLabel}
              </Badge>
              <Badge variant="soft" color="blue" className="rounded-full bg-sky-400/20 text-sky-100 backdrop-blur">
                {selectedModel}
              </Badge>
              <Badge variant="soft" color="gray" className="rounded-full bg-white/10 text-white/80 backdrop-blur">
                {messageCount} messages
              </Badge>
              <Badge variant="soft" color="purple" className="rounded-full bg-violet-400/20 text-violet-100 backdrop-blur">
                {templateCount} templates
              </Badge>
            </Flex>
            <Button
              onClick={handleCreateSession}
              size="3"
              variant="solid"
              color="jade"
              disabled={createSessionMutation.isPending}
              className="shadow-[0_25px_55px_-30px_rgba(16,185,129,0.85)]"
            >
              <PlusIcon /> New session
            </Button>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[2.4rem] border border-white/10 bg-slate-950/70 p-8 shadow-[0_60px_140px_-80px_rgba(56,189,248,0.6)]">
        <div className="pointer-events-none absolute inset-0 opacity-80">
          <div className="absolute -top-24 right-1/4 h-56 w-56 rounded-full bg-sky-500/15 blur-[150px]" />
          <div className="absolute -bottom-24 left-0 h-48 w-48 rounded-full bg-emerald-400/15 blur-[150px]" />
        </div>
        <div className="relative z-10 flex flex-col gap-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <Heading as="h2" size="4" className="text-white">
                Session switchboard
              </Heading>
              <Text size="2" color="gray">
                Select or launch orchestrations
              </Text>
            </div>
            <Button
              onClick={handleCreateSession}
              size="2"
              variant="soft"
              color="jade"
              disabled={createSessionMutation.isPending}
              className="shadow-[0_20px_45px_-25px_rgba(16,185,129,0.6)]"
            >
              <PlusIcon /> New session
            </Button>
          </div>
          <ScrollArea
            type="always"
            className="h-48 rounded-3xl border border-white/10 bg-slate-950/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          >
            <div className="flex flex-col gap-3">
              {sessions.length === 0 ? (
                <Text size="2" color="gray">
                  No sessions yet. Launch one to begin orchestrating.
                </Text>
              ) : (
                sessions.map((session) => {
                  const isActive = session.id === selectedSessionId;
                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => handleSelectSession(session.id)}
                      className={clsx(
                        "group relative flex items-center justify-between overflow-hidden rounded-2xl border px-4 py-3 text-left transition-all duration-300",
                        isActive
                          ? "border-emerald-400/60 bg-emerald-400/10 shadow-[0_25px_65px_-35px_rgba(16,185,129,0.7)]"
                          : "border-white/5 bg-white/5 hover:border-emerald-400/40 hover:bg-emerald-400/5"
                      )}
                    >
                      <span className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                        <span className="absolute inset-0 bg-gradient-to-r from-emerald-400/20 to-sky-500/10 blur-2xl" />
                      </span>
                      <div className="flex flex-col gap-1">
                        <Text weight="medium" className="text-white">
                          {session.title}
                        </Text>
                        <Text size="1" color="gray">
                          Updated {new Date(session.updatedAt).toLocaleTimeString()}
                        </Text>
                      </div>
                      {session.status === "archived" ? (
                        <Badge
                          color="gray"
                          variant="soft"
                          className="rounded-full bg-white/10 text-white/70 backdrop-blur"
                        >
                          Archived
                        </Badge>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section className="relative overflow-hidden rounded-[2.4rem] border border-white/10 bg-slate-950/70 p-8 shadow-[0_60px_140px_-80px_rgba(139,92,246,0.5)]">
          <div className="pointer-events-none absolute inset-0 opacity-80">
            <div className="absolute -top-24 left-1/3 h-56 w-56 rounded-full bg-violet-500/20 blur-[170px]" />
            <div className="absolute -bottom-24 right-0 h-48 w-48 rounded-full bg-sky-500/15 blur-[150px]" />
          </div>
          <div className="relative z-10 flex flex-col gap-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-1">
                <Heading as="h3" size="5" className="text-white">
                  {activeSessionTitle}
                </Heading>
                <Text size="2" color="gray">
                  Configure model routing and replay interactions.
                </Text>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Select.Root
                  value={selectedProvider}
                  onValueChange={handleProviderChange}
                  disabled={!selectedSessionId}
                >
                  <Select.Trigger className="min-w-[160px] rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white shadow-[0_20px_45px_-30px_rgba(56,189,248,0.45)] data-[placeholder]:text-white/60" />
                  <Select.Content>
                    {PROVIDER_OPTIONS.map((option) => (
                      <Select.Item key={option.value} value={option.value}>
                        {option.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
                <Select.Root
                  value={selectedModel}
                  onValueChange={handleModelChange}
                  disabled={!selectedSessionId}
                >
                  <Select.Trigger className="min-w-[160px] rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white shadow-[0_20px_45px_-30px_rgba(56,189,248,0.45)] data-[placeholder]:text-white/60" />
                  <Select.Content>
                    {availableModels.map((model) => (
                      <Select.Item key={model} value={model}>
                        {model}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
                <Select.Root
                  value={templateSelection}
                  onValueChange={handleTemplateSelection}
                  disabled={templateCount === 0}
                >
                  <Select.Trigger className="min-w-[180px] rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white shadow-[0_20px_45px_-30px_rgba(56,189,248,0.45)] data-[placeholder]:text-white/60" />
                  <Select.Content>
                    {Object.values(templates).map((template) => (
                      <Select.Item key={template.id} value={template.id}>
                        {template.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
                <Button
                  variant="soft"
                  size="2"
                  onClick={handleSaveTemplate}
                  disabled={!composerValue.trim()}
                  className="rounded-full bg-white/5 px-5 py-2 text-white shadow-[0_20px_45px_-25px_rgba(139,92,246,0.55)] hover:bg-emerald-400/20"
                >
                  <RocketIcon /> Save template
                </Button>
              </div>
            </div>

            <ScrollArea
              type="always"
              className="h-96 rounded-3xl border border-white/10 bg-slate-950/55 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <div className="flex flex-col gap-4">
                {messages.length === 0 ? (
                  <Text size="2" color="gray">
                    No messages yet. Use the composer below to send your first command.
                  </Text>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className="rounded-2xl border border-white/5 bg-white/5 p-4 shadow-[0_25px_60px_-40px_rgba(56,189,248,0.45)]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <Text weight="medium" className="text-foreground">
                          {message.role.toUpperCase()} • {new Date(message.createdAt).toLocaleTimeString()}
                        </Text>
                        {message.role !== "assistant" ? (
                          <Tooltip content="Re-issue command">
                            <IconButton
                              size="2"
                              variant="soft"
                              onClick={() => handleReissueCommand(message)}
                              aria-label="Re-issue command"
                              className="shadow-[0_18px_40px_-25px_rgba(139,92,246,0.55)]"
                            >
                              <ReloadIcon />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                      </div>
                      <Text className="text-foreground/90">{message.content}</Text>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            <div className="flex flex-col gap-3">
              <SegmentedControl.Root
                value={composerRole}
                onValueChange={(value) =>
                  setComposerRole(value as ComposerRole)
                }
                className="rounded-2xl border border-white/10 bg-white/5 text-white shadow-[0_20px_45px_-30px_rgba(56,189,248,0.45)]"
              >
                <SegmentedControl.Item value="user" className="data-[state=on]:bg-emerald-400/30">
                  Ask
                </SegmentedControl.Item>
                <SegmentedControl.Item value="system" className="data-[state=on]:bg-emerald-400/30">
                  Run
                </SegmentedControl.Item>
              </SegmentedControl.Root>
              <TextArea
                value={composerValue}
                onChange={(event) => setComposerValue(event.target.value)}
                placeholder="Send a message to the orchestrator"
                rows={4}
                disabled={!selectedSessionId || sendMessageMutation.isPending}
                className="rounded-2xl border border-white/10 bg-slate-950/60 text-foreground/90 shadow-[0_25px_60px_-40px_rgba(56,189,248,0.55)] focus:border-emerald-400/60"
              />
              <Flex justify="end" gap="2">
                <Button
                  onClick={handleSendMessage}
                  disabled={!selectedSessionId || !composerValue.trim()}
                  size="3"
                  color="jade"
                  className="shadow-[0_25px_55px_-30px_rgba(16,185,129,0.85)]"
                >
                  <PaperPlaneIcon /> Send
                </Button>
              </Flex>
            </div>
          </div>
        </section>

        <div className="flex w-full flex-col gap-4 xl:w-[24rem]">
          <CollapsiblePanel
            id={PANEL_IDS.context}
            title="Context bundles"
            description="Datasets staged for the next invocation"
            collapsed={Boolean(collapsedPanels[PANEL_IDS.context])}
            onToggle={handleTogglePanel}
          >
            {orchestratorMetadata?.contextBundles?.length ? (
              <ul className="space-y-3">
                {orchestratorMetadata.contextBundles.map((bundle) => (
                  <li
                    key={bundle.id}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_18px_45px_-30px_rgba(56,189,248,0.4)]"
                  >
                    <Text weight="medium" className="text-foreground">
                      {bundle.label}
                    </Text>
                    {bundle.summary ? (
                      <Text size="2" color="gray" className="text-foreground/80">
                        {bundle.summary}
                      </Text>
                    ) : null}
                    <Text size="1" color="gray">
                      {bundle.fileCount} files • {bundle.sizeBytes.toLocaleString()} bytes
                    </Text>
                  </li>
                ))}
              </ul>
            ) : (
              <Text size="2" color="gray">
                No context bundles associated yet.
              </Text>
            )}
          </CollapsiblePanel>

          <CollapsiblePanel
            id={PANEL_IDS.tools}
            title="Tool call tree"
            description="Live execution lineage"
            collapsed={Boolean(collapsedPanels[PANEL_IDS.tools])}
            onToggle={handleTogglePanel}
          >
            <ToolTree nodes={orchestratorMetadata?.toolInvocations ?? []} />
          </CollapsiblePanel>

          <CollapsiblePanel
            id={PANEL_IDS.agents}
            title="Agent hierarchy"
            description="Active delegations"
            collapsed={Boolean(collapsedPanels[PANEL_IDS.agents])}
            onToggle={handleTogglePanel}
          >
            <AgentTree nodes={orchestratorMetadata?.agentHierarchy ?? []} />
          </CollapsiblePanel>
        </div>
      </div>
    </div>
  );
}

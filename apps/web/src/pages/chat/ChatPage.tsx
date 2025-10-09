import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ComponentType,
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
  ChatBubbleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  GearIcon,
  MagicWandIcon,
  PaperPlaneIcon,
  PersonIcon,
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
  ToolCallStatusDto,
} from "@eddie/api-client";
import { useApi } from "@/api/api-provider";
import { useLayoutPreferences } from "@/hooks/useLayoutPreferences";
import type { LayoutPreferencesDto } from "@eddie/api-client";

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

type BadgeColor = ComponentProps<typeof Badge>["color"];

const TOOL_STATUS_COLORS: Record<ToolCallStatusDto, BadgeColor> = {
  pending: "gray",
  running: "blue",
  completed: "green",
  failed: "red",
};

type MessageRole = ChatMessageDto["role"];

interface MessageRoleStyle {
  label: string;
  badgeColor: BadgeColor;
  align: "start" | "end";
  cardClassName: string;
  icon: ComponentType<{ className?: string }>;
  iconClassName: string;
  contentClassName?: string;
}

const MESSAGE_ROLE_STYLES: Record<MessageRole, MessageRoleStyle> = {
  user: {
    label: "User",
    badgeColor: "blue",
    align: "end",
    cardClassName:
      "border border-primary/30 bg-primary/10 text-primary-foreground shadow-sm",
    icon: PersonIcon,
    iconClassName: "text-blue-500",
    contentClassName: "whitespace-pre-wrap leading-relaxed",
  },
  assistant: {
    label: "Assistant",
    badgeColor: "green",
    align: "start",
    cardClassName: "border border-muted/50 bg-card shadow-sm",
    icon: MagicWandIcon,
    iconClassName: "text-emerald-500",
    contentClassName: "whitespace-pre-wrap leading-relaxed",
  },
  system: {
    label: "Command",
    badgeColor: "purple",
    align: "start",
    cardClassName:
      "border border-accent/40 bg-accent/10 text-accent-foreground shadow-sm",
    icon: GearIcon,
    iconClassName: "text-purple-500",
    contentClassName: "whitespace-pre-wrap text-sm font-mono",
  },
};

function formatTime(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

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
    <Card className="flex flex-col gap-3">
      <Flex align="center" justify="between" gap="3">
        <Box>
          <Heading as="h3" size="3">
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
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
          </IconButton>
        </Tooltip>
      </Flex>
      {!collapsed ? <Box className="text-sm text-foreground/90">{children}</Box> : null}
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
    <ul className="space-y-3">
      {nodes.map((node) => {
        const statusColor = TOOL_STATUS_COLORS[node.status] ?? "gray";
        const command =
          typeof node.metadata?.command === "string"
            ? node.metadata.command
            : typeof node.metadata?.preview === "string"
              ? node.metadata.preview
              : null;
        const executedAt = formatDateTime(node.metadata?.createdAt);
        const args =
          typeof node.metadata?.arguments === "string"
            ? node.metadata.arguments
            : null;

        return (
          <li
            key={node.id}
            className="rounded-xl border border-muted/40 bg-muted/10 p-4"
          >
            <Flex align="center" justify="between" gap="3">
              <Flex align="center" gap="2">
                <Badge variant="soft" color="gray">
                  Tool
                </Badge>
                <Text weight="medium" className="font-mono text-sm">
                  {node.name}
                </Text>
              </Flex>
              <Badge color={statusColor} variant="soft">
                {node.status.toUpperCase()}
              </Badge>
            </Flex>

            {command ? (
              <Box className="mt-3 rounded-md bg-background/80 p-3 font-mono text-xs text-foreground/80">
                {command}
              </Box>
            ) : null}

            <Flex
              align="center"
              justify={args ? "between" : "start"}
              className="mt-3"
              gap="2"
            >
              {executedAt ? (
                <Text size="1" color="gray">
                  Captured {executedAt}
                </Text>
              ) : null}
              {args ? (
                <Text size="1" color="gray">
                  Args: {args}
                </Text>
              ) : null}
            </Flex>

            {node.children.length > 0 ? (
              <Box className="mt-3 border-l border-dashed border-muted/50 pl-3">
                <ToolTree nodes={node.children} />
              </Box>
            ) : null}
          </li>
        );
      })}
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
    <ul className="space-y-3">
      {nodes.map((node) => {
        const providerLabel = node.provider ?? "Unknown provider";
        const modelLabel = node.model ?? "Unknown model";
        const depth = typeof node.depth === "number" ? node.depth : null;
        const messageCount =
          typeof node.metadata?.messageCount === "number"
            ? node.metadata.messageCount
            : null;

        return (
          <li
            key={node.id}
            className="rounded-xl border border-muted/40 bg-muted/5 p-4"
          >
            <Flex direction="column" gap="2">
              <Flex align="center" gap="2">
                <Text weight="medium">{node.name}</Text>
                {depth !== null ? (
                  <Badge variant="soft" color="gray">
                    depth {depth}
                  </Badge>
                ) : null}
              </Flex>
              <Flex align="center" gap="2">
                <Badge variant="soft" color="blue">
                  {providerLabel}
                </Badge>
                <Badge variant="soft" color="gray">
                  {modelLabel}
                </Badge>
              </Flex>
              {messageCount !== null ? (
                <Text size="1" color="gray">
                  Messages observed: {messageCount}
                </Text>
              ) : null}
              {node.children.length > 0 ? (
                <Box className="border-l border-dashed border-muted/50 pl-3">
                  <AgentTree nodes={node.children} />
                </Box>
              ) : null}
            </Flex>
          </li>
        );
      })}
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
    <Flex direction="column" className="mx-auto w-full max-w-7xl gap-6 px-6 py-8">
      <Flex align="center" gap="3">
        <ChatBubbleIcon className="text-3xl" />
        <Heading size="6">Chat orchestrator</Heading>
      </Flex>

      <Card>
        <Flex align="center" justify="between" gap="3" wrap="wrap">
          <Flex align="center" gap="3" wrap="wrap">
            <Heading as="h2" size="4">
              Sessions
            </Heading>
            {sessions.length === 0 ? (
              <Text size="2" color="gray">
                Create a session to begin orchestrating conversations.
              </Text>
            ) : null}
          </Flex>
          <Button
            onClick={handleCreateSession}
            size="2"
            variant="solid"
            color="jade"
            disabled={createSessionMutation.isPending}
          >
            <PlusIcon /> New session
          </Button>
        </Flex>
        <ScrollArea type="always" className="mt-4 max-h-40">
          <Flex gap="2" wrap="wrap">
            {sessions.length === 0 ? (
              <Text size="2" color="gray">
                No sessions yet.
              </Text>
            ) : (
              sessions.map((session) => (
                <Button
                  key={session.id}
                  size="2"
                  variant={
                    session.id === selectedSessionId ? "solid" : "soft"
                  }
                  color={session.id === selectedSessionId ? "jade" : "gray"}
                  onClick={() => handleSelectSession(session.id)}
                >
                  <Flex align="center" gap="2">
                    <span>{session.title}</span>
                    {session.status === "archived" ? (
                      <Badge color="gray" variant="soft">
                        Archived
                      </Badge>
                    ) : null}
                  </Flex>
                </Button>
              ))
            )}
          </Flex>
        </ScrollArea>
      </Card>

      <div className="flex flex-col gap-6 lg:flex-row">
        <Card className="flex-1 space-y-5">
          <Flex align="center" justify="between" wrap="wrap" gap="3">
            <Heading as="h3" size="4">
              {sessions.find((session) => session.id === selectedSessionId)?.title ??
                "Select a session"}
            </Heading>
            <Flex align="center" gap="3" wrap="wrap">
              <Select.Root
                value={selectedProvider}
                onValueChange={handleProviderChange}
                disabled={!selectedSessionId}
              >
                <Select.Trigger placeholder="Provider" />
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
                <Select.Trigger placeholder="Model" />
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
                disabled={Object.keys(templates).length === 0}
              >
                <Select.Trigger placeholder="Load template" />
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
              >
                <RocketIcon /> Save template
              </Button>
            </Flex>
          </Flex>

          <ScrollArea type="always" className="h-96 rounded-xl border border-muted/40 bg-muted/10 p-4">
            <Flex direction="column" gap="4">
              {messages.length === 0 ? (
                <Text size="2" color="gray">
                  No messages yet. Use the composer below to send your first
                  command.
                </Text>
              ) : (
                messages.map((message) => {
                  const roleStyle = MESSAGE_ROLE_STYLES[message.role];
                  const timestamp = formatTime(message.createdAt);
                  const Icon = roleStyle.icon;
                  const alignmentClass =
                    roleStyle.align === "end"
                      ? "ml-auto w-full max-w-2xl"
                      : "mr-auto w-full max-w-2xl";

                  return (
                    <Box key={message.id} className={alignmentClass}>
                      <Card
                        variant="surface"
                        className={`space-y-3 ${roleStyle.cardClassName}`}
                      >
                        <Flex align="start" justify="between" gap="3">
                          <Flex align="center" gap="2">
                            <Box className="rounded-full bg-background/80 p-2">
                              <Icon
                                className={`h-4 w-4 ${roleStyle.iconClassName}`}
                              />
                            </Box>
                            <Badge color={roleStyle.badgeColor} variant="soft">
                              {roleStyle.label}
                            </Badge>
                            {timestamp ? (
                              <Text size="1" color="gray">
                                {timestamp}
                              </Text>
                            ) : null}
                          </Flex>
                          {message.role !== "assistant" ? (
                            <Tooltip content="Re-issue command">
                              <IconButton
                                size="2"
                                variant="soft"
                                onClick={() => handleReissueCommand(message)}
                                aria-label="Re-issue command"
                              >
                                <ReloadIcon />
                              </IconButton>
                            </Tooltip>
                          ) : null}
                        </Flex>
                        <Box
                          className={`text-sm text-foreground/90 ${
                            roleStyle.contentClassName ?? ""
                          }`}
                        >
                          {message.content}
                        </Box>
                      </Card>
                    </Box>
                  );
                })
              )}
            </Flex>
          </ScrollArea>

          <Flex direction="column" gap="3">
            <SegmentedControl.Root
              value={composerRole}
              onValueChange={(value) =>
                setComposerRole(value as ComposerRole)
              }
            >
              <SegmentedControl.Item value="user">Ask</SegmentedControl.Item>
              <SegmentedControl.Item value="system">Run</SegmentedControl.Item>
            </SegmentedControl.Root>
            <TextArea
              value={composerValue}
              onChange={(event) => setComposerValue(event.target.value)}
              placeholder="Send a message to the orchestrator"
              rows={4}
              disabled={!selectedSessionId || sendMessageMutation.isPending}
            />
            <Flex justify="end" gap="2">
              <Button
                onClick={handleSendMessage}
                disabled={!selectedSessionId || !composerValue.trim()}
              >
                <PaperPlaneIcon /> Send
              </Button>
            </Flex>
          </Flex>
        </Card>

        <div className="flex w-full flex-col gap-4 lg:w-80">
          <CollapsiblePanel
            id={PANEL_IDS.context}
            title="Context bundles"
            description="Datasets staged for the next invocation"
            collapsed={Boolean(collapsedPanels[PANEL_IDS.context])}
            onToggle={handleTogglePanel}
          >
            {orchestratorMetadata?.contextBundles?.length ? (
              <ul className="space-y-2">
                {orchestratorMetadata.contextBundles.map((bundle) => (
                  <li
                    key={bundle.id}
                    className="rounded-lg border border-muted/40 p-3"
                  >
                    <Text weight="medium">{bundle.label}</Text>
                    {bundle.summary ? (
                      <Text size="2" color="gray">
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
    </Flex>
  );
}

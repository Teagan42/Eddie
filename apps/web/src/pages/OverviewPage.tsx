import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  ScrollArea,
  Select,
  Separator,
  Text,
  TextField,
  Skeleton,
} from '@radix-ui/themes';
import { ArrowUpRight, KeyRound, Sparkles, Waves } from 'lucide-react';
import { PaperPlaneIcon, PlusIcon, ReloadIcon } from '@radix-ui/react-icons';
import { Panel } from "@eddie/ui";
import { ChatSessionsPanel } from "@eddie/ui/chat";
import { OverviewAuthPanel } from "@eddie/ui/overview";
import { useAuth } from '@/auth/auth-context';
import { useApi } from '@/api/api-provider';
import { AVAILABLE_THEMES, formatThemeLabel } from '@eddie/ui/overview';
import { useTheme } from '@/theme';
import { cn } from '@/vendor/lib/utils';
import { OverviewHero } from './components';
import { useChatSessionEvents, useOverviewStats } from './hooks';
import type {
  ChatMessageDto,
  ChatSessionDto,
  CreateChatMessageDto,
  CreateChatSessionDto,
  LogEntryDto,
  RuntimeConfigDto,
} from '@eddie/api-client';

type StatItem = {
  label: string;
  value: number;
  hint: string;
  icon: ComponentType<{ className?: string }>;
};

interface SessionFormState {
  title: string;
  description: string;
}

const LOGS_PAGE_SIZE = 50;
const MAX_LOG_PAGES = 4;

function chunkLogs(entries: LogEntryDto[]): LogEntryDto[][] {
  const limited = entries.slice(-LOGS_PAGE_SIZE * MAX_LOG_PAGES);
  if (limited.length === 0) {
    return [[]];
  }

  const pages: LogEntryDto[][] = [];
  for (let index = 0; index < limited.length; index += LOGS_PAGE_SIZE) {
    pages.push(limited.slice(index, index + LOGS_PAGE_SIZE));
  }

  return pages;
}

export function OverviewPage(): JSX.Element {
  const { apiKey, setApiKey } = useAuth();
  const api = useApi();
  const queryClient = useQueryClient();
  const [newSessionTitle, setNewSessionTitle] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState<string>('');

  const sessionsQuery = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: () => api.http.chatSessions.list(),
  });

  const tracesQuery = useQuery({
    queryKey: ['traces'],
    queryFn: () => api.http.traces.list(),
  });

  const logsQuery = useInfiniteQuery({
    queryKey: ['logs'],
    initialPageParam: 0,
    queryFn: ({ pageParam = 0 }) =>
      api.http.logs.list({ offset: pageParam, limit: LOGS_PAGE_SIZE }),
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === LOGS_PAGE_SIZE ? pages.length * LOGS_PAGE_SIZE : undefined,
  });

  const logPages = useMemo(() => logsQuery.data?.pages ?? [], [logsQuery.data?.pages]);
  const logs = useMemo(() => logPages.flat(), [logPages]);
  const logCount = useMemo(
    () => logPages.reduce((total, page) => total + page.length, 0),
    [logPages],
  );

  const loadMoreNodeRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const updateObserver = useCallback(() => {
    observerRef.current?.disconnect();

    const target = loadMoreNodeRef.current;
    if (!target) {
      observerRef.current = null;
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && logsQuery.hasNextPage && !logsQuery.isFetchingNextPage) {
            void logsQuery.fetchNextPage();
          }
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(target);
    observerRef.current = observer;
  }, [logsQuery]);

  function setLoadMoreRef(node: HTMLDivElement | null) {
    loadMoreNodeRef.current = node;
    updateObserver();
  }

  const configQuery = useQuery({
    queryKey: ['config'],
    queryFn: () => api.http.config.get(),
  });

  const messagesQuery = useQuery({
    queryKey: ['chat-sessions', selectedSessionId, 'messages'],
    enabled: Boolean(selectedSessionId),
    queryFn: () =>
      selectedSessionId
        ? api.http.chatSessions.listMessages(selectedSessionId)
        : Promise.resolve([]),
  });

  const stats = useOverviewStats({
    sessionCount: sessionsQuery.data?.length,
    traceCount: tracesQuery.data?.length,
    logCount,
  });

  const mergeLogsIntoCache = useCallback(
    (incoming: LogEntryDto | LogEntryDto[]): void => {
      const batch = Array.isArray(incoming) ? incoming : [incoming];
      if (batch.length === 0) {
        return;
      }

      queryClient.setQueryData<InfiniteData<LogEntryDto[]>>(['logs'], (current) => {
        const existing = current?.pages.flat() ?? [];
        const byId = new Map<string, LogEntryDto>();

        for (const entry of existing) {
          byId.set(entry.id, entry);
        }

        for (const entry of batch) {
          byId.set(entry.id, entry);
        }

        const sorted = Array.from(byId.values()).sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

        const pages = chunkLogs(sorted);
        const pageParams = pages.map((_, index) => index * LOGS_PAGE_SIZE);

        return { pages, pageParams } satisfies InfiniteData<LogEntryDto[]>;
      });
    },
    [queryClient],
  );

  useEffect(() => {
    if (!selectedSessionId && sessionsQuery.data?.length) {
      setSelectedSessionId(sessionsQuery.data[0]?.id ?? null);
    }
  }, [sessionsQuery.data, selectedSessionId]);

  useChatSessionEvents({
    api,
    queryClient,
    mergeLogsIntoCache,
    selectedSessionId,
  });

  useEffect(() => {
    updateObserver();
    return () => {
      observerRef.current?.disconnect();
    };
  }, [logs.length, updateObserver]);

  const createSessionMutation = useMutation({
    mutationFn: (input: CreateChatSessionDto) => api.http.chatSessions.create(input),
    onSuccess: (session) => {
      setNewSessionTitle('');
      setSelectedSessionId(session.id);
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
    },
  });

  const createMessageMutation = useMutation({
    mutationFn: async (input: { sessionId: string; body: CreateChatMessageDto }) => {
      await api.http.chatSessions.createMessage(input.sessionId, input.body);
    },
    onSuccess: (_, variables) => {
      setMessageDraft('');
      queryClient.invalidateQueries({
        queryKey: ['chat-sessions', variables.sessionId, 'messages'],
      });
    },
  });

  const emitLogMutation = useMutation({
    mutationFn: () => api.http.logs.emit(),
    onSuccess: (entry) => {
      mergeLogsIntoCache(entry);
    },
  });

  const { theme, setTheme, isThemeStale } = useTheme();

  const panelSurfaceClass = cn(
    "h-80 rounded-2xl border p-4",
    "border-[color:var(--overview-panel-border)]",
    "bg-[color:var(--overview-panel-bg)]",
    "shadow-[var(--overview-panel-shadow)]"
  );
  const panelItemClass = cn(
    "rounded-2xl border p-4",
    "border-[color:var(--overview-panel-item-border)]",
    "bg-[color:var(--overview-panel-item-bg)]",
    "shadow-[var(--overview-panel-item-shadow)]"
  );
  const mutedTextClass = "text-[color:var(--overview-panel-muted)]";
  const codeTextClass = "font-mono text-[color:var(--overview-panel-code)]";
  const dividerClass = "border-[color:var(--overview-panel-divider)]";

  const activeSession = useMemo<ChatSessionDto | null>(() => {
    if (!selectedSessionId) {
      return null;
    }
    return sessionsQuery.data?.find((session) => session.id === selectedSessionId) ?? null;
  }, [selectedSessionId, sessionsQuery.data]);

  const handleCreateSession = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!newSessionTitle.trim()) {
      return;
    }
    createSessionMutation.mutate({
      title: newSessionTitle.trim(),
      description: undefined,
    });
  };

  const handleSendMessage = (): void => {
    if (!selectedSessionId || !messageDraft.trim()) {
      return;
    }
    createMessageMutation.mutate({
      sessionId: selectedSessionId,
      body: {
        role: 'user' as CreateChatMessageDto['role'],
        content: messageDraft.trim(),
      },
    });
  };

  const handleSelectTheme = (nextTheme: RuntimeConfigDto["theme"]): void => {
    setTheme(nextTheme);
  };

  return (
    <Flex direction="column" gap="8">
      <OverviewHero
        apiKey={apiKey}
        apiUrl={configQuery.data?.apiUrl}
        theme={theme}
        themes={AVAILABLE_THEMES}
        onSelectTheme={handleSelectTheme}
        onRemoveApiKey={() => setApiKey(null)}
        stats={stats}
        isThemeSelectorDisabled={isThemeStale}
      />

      <OverviewAuthPanel apiKey={apiKey} onApiKeyChange={setApiKey} />

      <Grid columns={{ initial: '1', xl: '2' }} gap="6">
        <ChatSessionsPanel
          sessions={sessionsQuery.data}
          selectedSessionId={selectedSessionId}
          onSelectSession={setSelectedSessionId}
          onCreateSession={handleCreateSession}
          newSessionTitle={newSessionTitle}
          onNewSessionTitleChange={setNewSessionTitle}
          isCreatingSession={createSessionMutation.isPending}
          activeSession={activeSession}
          messages={messagesQuery.data}
          isMessagesLoading={messagesQuery.isLoading}
          onSubmitMessage={handleSendMessage}
          messageDraft={messageDraft}
          onMessageDraftChange={setMessageDraft}
          isMessagePending={createMessageMutation.isPending}
        />

        <Panel title="Traces" description="Real-time observability into orchestrated workloads">
          {tracesQuery.isLoading ? (
            <Text size="2" className={mutedTextClass}>
              Loading traces…
            </Text>
          ) : tracesQuery.data?.length ? (
            <ScrollArea type="always" className={panelSurfaceClass}>
              <Flex direction="column" gap="3">
                {tracesQuery.data.map((trace) => (
                  <Flex
                    key={trace.id}
                    direction="column"
                    className={panelItemClass}
                  >
                    <Flex align="center" justify="between">
                      <Text size="2" weight="medium">
                        {trace.name}
                      </Text>
                      <Badge color={trace.status === 'failed' ? 'red' : 'grass'} variant="solid">
                        {trace.status.toUpperCase()}
                      </Badge>
                    </Flex>
                    <Text size="1" className={mutedTextClass}>
                      Duration: {trace.durationMs ? `${trace.durationMs}ms` : 'pending'}
                    </Text>
                  </Flex>
                ))}
              </Flex>
            </ScrollArea>
          ) : (
            <Text size="2" className={mutedTextClass}>
              No traces emitted yet.
            </Text>
          )}
        </Panel>
      </Grid>

      <Grid columns={{ initial: '1', xl: '2' }} gap="6">
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
            <Text size="2" className={mutedTextClass}>
              Loading logs…
            </Text>
          ) : logs.length ? (
            <ScrollArea
              type="always"
              className={panelSurfaceClass}
              data-testid="logs-scroll-area"
            >
              <Flex direction="column" gap="3">
                {logs.map((entry) => (
                  <Flex
                    key={entry.id}
                    direction="column"
                    className={panelItemClass}
                    data-testid="log-entry"
                  >
                    <Flex align="center" justify="between">
                      <Text size="1" className={mutedTextClass}>
                        {new Date(entry.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </Text>
                      <Badge color={entry.level === 'error' ? 'red' : 'grass'} variant="surface">
                        {entry.level.toUpperCase()}
                      </Badge>
                    </Flex>
                    <Text size="2">{entry.message}</Text>
                  </Flex>
                ))}
                {logsQuery.isFetchingNextPage && (
                  <Flex data-testid="logs-loading-skeleton" direction="column" gap="2">
                    <Skeleton height="48px" />
                    <Skeleton height="48px" />
                  </Flex>
                )}
                <div ref={setLoadMoreRef} />
              </Flex>
            </ScrollArea>
          ) : (
            <Text size="2" className={mutedTextClass}>
              Awaiting log entries.
            </Text>
          )}
        </Panel>

        <Panel
          title="Runtime Config"
          description="Adjust live settings for connected dashboards"
          actions={
            <Select.Root value={theme} onValueChange={handleSelectTheme} disabled={isThemeStale}>
              <Select.Trigger
                aria-label="Theme"
                size="2"
                className={cn(
                  'w-40 justify-between',
                  'border border-transparent',
                  'bg-gradient-to-r',
                  'from-[hsl(var(--hero-cta-from))]',
                  'via-[hsl(var(--hero-cta-via))]',
                  'to-[hsl(var(--hero-cta-to))]',
                  'text-[color:var(--hero-cta-foreground)]',
                  'shadow-[var(--hero-cta-shadow)]',
                  'dark:from-[hsl(var(--hero-cta-from-dark))]',
                  'dark:via-[hsl(var(--hero-cta-via-dark))]',
                  'dark:to-[hsl(var(--hero-cta-to-dark))]',
                  'dark:text-[color:var(--hero-cta-foreground-dark)]',
                  'dark:shadow-[var(--hero-cta-shadow-dark)]'
                )}
                data-testid="runtime-theme-trigger"
              >
                Theme: {formatThemeLabel(theme)}
              </Select.Trigger>
              <Select.Content
                position="popper"
                className={cn(
                  'min-w-[--radix-select-trigger-width] rounded-2xl border',
                  'border-[color:var(--hero-outline-border)]',
                  'bg-[color:var(--hero-outline-bg)]',
                  'text-[color:var(--hero-outline-foreground)]',
                  'shadow-[var(--hero-surface-shadow)]',
                  'dark:border-[color:var(--hero-outline-border-dark)]',
                  'dark:bg-[color:var(--hero-outline-bg-dark)]',
                  'dark:text-[color:var(--hero-outline-foreground-dark)]',
                  'dark:shadow-[var(--hero-surface-shadow-dark)]'
                )}
              >
                <Select.Group>
                  <Select.Label className="text-[color:var(--hero-outline-foreground)] dark:text-[color:var(--hero-outline-foreground-dark)]">
                    Themes
                  </Select.Label>
                  {AVAILABLE_THEMES.map((availableTheme) => (
                    <Select.Item key={availableTheme.id} value={availableTheme.id}>
                      {formatThemeLabel(availableTheme.id, AVAILABLE_THEMES)}
                    </Select.Item>
                  ))}
                </Select.Group>
              </Select.Content>
            </Select.Root>
          }
        >
          {configQuery.isLoading ? (
            <Text size="2" className={mutedTextClass}>
              Loading configuration…
            </Text>
          ) : configQuery.data ? (
            <Flex direction="column" gap="4">
              <Box className={panelItemClass}>
                <Text size="1" className={mutedTextClass}>
                  API URL
                </Text>
                <Text size="2" className={codeTextClass}>
                  {configQuery.data.apiUrl}
                </Text>
              </Box>
              <Box className={panelItemClass}>
                <Text size="1" className={mutedTextClass}>
                  WebSocket URL
                </Text>
                <Text size="2" className={codeTextClass}>
                  {configQuery.data.websocketUrl}
                </Text>
              </Box>
              <Flex align="center" justify="between">
                <Text size="2">Theme</Text>
                <Badge variant="surface" color="grass">
                  {configQuery.data.theme}
                </Badge>
              </Flex>
              <Separator className={dividerClass} />
              <Flex gap="2" wrap="wrap">
                {Object.entries(configQuery.data.features).map(([feature, enabled]) => (
                  <Badge
                    key={feature}
                    variant={enabled ? 'solid' : 'soft'}
                    color={enabled ? 'grass' : 'gray'}
                    className="uppercase tracking-wide"
                  >
                    {feature}
                  </Badge>
                ))}
              </Flex>
            </Flex>
          ) : (
            <Text size="2" className={mutedTextClass}>
              Unable to load configuration.
            </Text>
          )}
        </Panel>
      </Grid>
    </Flex>
  );
}

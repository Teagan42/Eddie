import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { LogEntryDto } from "@eddie/api-client";
import { OverviewPage } from "../OverviewPage";
import { ThemeProvider } from "@/theme";

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ apiKey: "test", setApiKey: vi.fn() }),
}));

type LogsListCall = { offset: number; limit: number } | undefined;

const logsList = vi
  .fn<[LogsListCall], Promise<LogEntryDto[]>>()
  .mockResolvedValue([]);
const registerLogListener = vi.fn();
const registerMessageUpdated = vi.fn().mockReturnValue(() => {});

vi.mock("@/api/api-provider", () => ({
  useApi: () => ({
    http: {
      chatSessions: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        get: vi.fn(),
        archive: vi.fn(),
        listMessages: vi.fn().mockResolvedValue([]),
        createMessage: vi.fn(),
      },
      traces: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn(),
      },
      logs: {
        list: logsList,
        emit: vi.fn(),
      },
      config: {
        get: vi.fn().mockResolvedValue({
          apiUrl: "http://example.com",
          websocketUrl: "ws://example.com",
          theme: "dark",
          features: {},
        }),
        update: vi.fn(),
        getSchema: vi.fn(),
        loadEddieConfig: vi.fn(),
        previewEddieConfig: vi.fn(),
        saveEddieConfig: vi.fn(),
      },
      preferences: {
        getLayout: vi.fn().mockResolvedValue({
          chat: { collapsedPanels: {} },
          updatedAt: new Date().toISOString(),
        }),
        updateLayout: vi.fn(),
      },
      orchestrator: {
        getMetadata: vi.fn().mockResolvedValue({ tools: [], providers: [] }),
      },
    },
    sockets: {
      chatSessions: {
        onSessionCreated: vi.fn().mockReturnValue(() => {}),
        onSessionUpdated: vi.fn().mockReturnValue(() => {}),
        onSessionDeleted: vi.fn().mockReturnValue(() => {}),
        onMessageCreated: vi.fn().mockReturnValue(() => {}),
        onMessageUpdated: registerMessageUpdated,
        onAgentActivity: vi.fn().mockReturnValue(() => {}),
      },
      traces: {
        onTraceCreated: vi.fn().mockReturnValue(() => {}),
        onTraceUpdated: vi.fn().mockReturnValue(() => {}),
      },
      logs: {
        onLogCreated: registerLogListener,
      },
      config: {
        onConfigUpdated: vi.fn().mockReturnValue(() => {}),
      },
    },
  }),
}));

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.assign(globalThis, { ResizeObserver: ResizeObserverMock });

class IntersectionObserverMock implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = "0px";
  readonly thresholds: ReadonlyArray<number> = [];
  constructor(readonly callback: IntersectionObserverCallback) {
    intersectionObservers.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  trigger(entries: IntersectionObserverEntry[]): void {
    this.callback(entries, this);
  }
}

const intersectionObservers: IntersectionObserverMock[] = [];
const activeQueryClients: QueryClient[] = [];

Object.assign(globalThis, {
  IntersectionObserver: vi
    .fn<(callback: IntersectionObserverCallback) => IntersectionObserver>()
    .mockImplementation((callback: IntersectionObserverCallback) =>
      new IntersectionObserverMock(callback)
    ),
});

function renderOverview(): {
  emitLog(entry: LogEntryDto): void;
  } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  activeQueryClients.push(queryClient);

  let handler: ((entry: LogEntryDto) => void) | null = null;
  registerLogListener.mockImplementation((callback: (entry: LogEntryDto) => void) => {
    handler = callback;
    return () => {
      handler = null;
    };
  });

  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MemoryRouter>
          <OverviewPage />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );

  return {
    emitLog(entry: LogEntryDto) {
      if (!handler) {
        throw new Error("Log listener not registered");
      }
      handler(entry);
    },
  };
}

describe("OverviewPage log updates", () => {
  beforeEach(() => {
    logsList.mockReset();
    logsList.mockResolvedValue([]);
    registerLogListener.mockReset();
    registerMessageUpdated.mockReset();
    registerMessageUpdated.mockReturnValue(() => {});
    intersectionObservers.splice(0, intersectionObservers.length);
    (globalThis.IntersectionObserver as unknown as vi.Mock).mockClear();
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    while (activeQueryClients.length) {
      activeQueryClients.pop()?.clear();
    }
  });

  it("applies the document dark class from runtime config", async () => {
    renderOverview();

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  it("does not refetch logs when websocket entries arrive", async () => {
    const { emitLog } = renderOverview();

    await waitFor(() => {
      expect(registerLogListener).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(registerMessageUpdated).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(logsList).toHaveBeenCalledWith({ offset: 0, limit: 50 });
    });

    emitLog(createLogEntry(1, "streamed"));

    await waitFor(() => {
      expect(logsList).toHaveBeenCalledTimes(1);
    });
  });

  it("requests the next page when the sentinel becomes visible", async () => {
    logsList.mockResolvedValueOnce(createLogBatch(50));
    logsList.mockResolvedValueOnce(createLogBatch(10, 50));

    renderOverview();

    await waitFor(() => {
      expect(logsList).toHaveBeenCalledWith({ offset: 0, limit: 50 });
    });

    await waitFor(() => {
      expect(intersectionObservers.length).toBeGreaterThan(0);
    });

    const observer = intersectionObservers.at(-1);
    expect(observer).toBeDefined();

    observer!.trigger([createIntersectionEntry()]);

    await waitFor(() => {
      expect(logsList).toHaveBeenNthCalledWith(2, { offset: 50, limit: 50 });
    });
  });

  it("displays a skeleton while loading additional pages", async () => {
    let resolvePage: ((logs: LogEntryDto[]) => void) | null = null;
    const pending = new Promise<LogEntryDto[]>((resolve) => {
      resolvePage = resolve;
    });

    logsList.mockResolvedValueOnce(createLogBatch(50));
    logsList.mockImplementationOnce(() => pending);

    renderOverview();

    await waitFor(() => {
      expect(logsList).toHaveBeenCalledWith({ offset: 0, limit: 50 });
    });

    await waitFor(() => {
      expect(intersectionObservers.length).toBeGreaterThan(0);
    });

    const observer = intersectionObservers.at(-1);
    observer!.trigger([createIntersectionEntry()]);

    await waitFor(() => {
      expect(logsList).toHaveBeenNthCalledWith(2, { offset: 50, limit: 50 });
    });

    await waitFor(() => {
      expect(screen.getByTestId("logs-loading-skeleton")).toBeInTheDocument();
    });

    resolvePage?.(createLogBatch(2, 50));

    await waitFor(() => {
      expect(screen.queryByTestId("logs-loading-skeleton")).not.toBeInTheDocument();
    });
  });
});

function createLogEntry(index: number, message?: string): LogEntryDto {
  return {
    id: `log-${index}`,
    level: "info",
    message: message ?? `Log ${index}`,
    createdAt: new Date(Date.UTC(2024, 0, 1, 0, 0, index)).toISOString(),
    context: {},
  };
}

function createLogBatch(count: number, start = 0): LogEntryDto[] {
  return Array.from({ length: count }, (_, offset) =>
    createLogEntry(start + offset)
  );
}

function createIntersectionEntry(): IntersectionObserverEntry {
  return {
    isIntersecting: true,
    intersectionRatio: 1,
    target: document.createElement("div"),
    boundingClientRect: {} as DOMRectReadOnly,
    intersectionRect: {} as DOMRectReadOnly,
    rootBounds: null,
    time: Date.now(),
  } as IntersectionObserverEntry;
}

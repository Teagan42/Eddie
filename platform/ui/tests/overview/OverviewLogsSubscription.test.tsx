import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";

import { OverviewPage } from "../../src/overview";
import { AVAILABLE_THEMES, ThemeProvider } from "../../src/overview/theme";

vi.mock("../../src/overview/auth", () => ({
  useAuth: () => ({ apiKey: "test", setApiKey: vi.fn() }),
}));

type LogsListCall = { offset: number; limit: number } | undefined;

type OverviewLogEntry = {
  id: string;
  message: string;
  level: string;
  timestamp: string;
  [key: string]: unknown;
};

const logsList = vi
  .fn<[LogsListCall], Promise<OverviewLogEntry[]>>()
  .mockResolvedValue([]);
const registerLogListener = vi.fn();
const registerMessageUpdated = vi.fn().mockReturnValue(() => {});

vi.mock("../../src/overview/api", () => ({
  useOverviewApi: () => ({
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
        getExecutionState: vi.fn().mockResolvedValue(null),
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
      new IntersectionObserverMock(callback),
    ),
});

function renderOverview(): {
  emitLog(entry: OverviewLogEntry): void;
} {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  activeQueryClients.push(queryClient);

  let handler: ((entry: OverviewLogEntry) => void) | null = null;
  registerLogListener.mockImplementation((callback: (entry: OverviewLogEntry) => void) => {
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
    </QueryClientProvider>,
  );

  return {
    emitLog(entry: OverviewLogEntry) {
      if (!handler) {
        throw new Error("Log listener not registered");
      }
      handler(entry);
    },
  };
}

describe("OverviewPage log updates", () => {
  beforeEach(() => {
    logsList.mockClear();
    registerLogListener.mockClear();
    registerMessageUpdated.mockClear();
  });

  afterEach(async () => {
    for (const observer of intersectionObservers) {
      observer.disconnect();
    }
    intersectionObservers.length = 0;

    while (activeQueryClients.length > 0) {
      const client = activeQueryClients.pop();
      if (!client) {
        continue;
      }
      await client.cancelQueries();
      client.clear();
    }
  });

  it("renders live log entries streamed from the socket", async () => {
    const { emitLog } = renderOverview();

    emitLog({
      id: "log-1",
      message: "Agent completed task",
      level: "info",
      timestamp: new Date().toISOString(),
    });

    await waitFor(() => {
      expect(screen.getByText("Agent completed task")).toBeInTheDocument();
    });
  });

  it("supports infinite scroll pagination for older entries", async () => {
    const user = userEvent.setup();
    const { emitLog } = renderOverview();

    emitLog({
      id: "log-1",
      message: "Agent completed task",
      level: "info",
      timestamp: new Date().toISOString(),
    });

    await waitFor(() => {
      expect(screen.getByText("Agent completed task")).toBeInTheDocument();
    });

    const list = screen.getByRole("list", { name: /system logs/i });
    const lastItem = within(list).getAllByRole("listitem").at(-1);
    expect(lastItem).toBeTruthy();

    const observer = intersectionObservers.at(-1);
    expect(observer).toBeTruthy();

    const loadMore = vi.fn();
    registerMessageUpdated.mockReturnValue(loadMore);

    observer?.trigger([
      {
        isIntersecting: true,
        target: lastItem as Element,
        intersectionRatio: 1,
        boundingClientRect: DOMRectReadOnly.fromRect(),
        intersectionRect: DOMRectReadOnly.fromRect(),
        rootBounds: DOMRectReadOnly.fromRect(),
        time: performance.now(),
      },
    ]);

    await waitFor(() => {
      expect(logsList).toHaveBeenCalledWith({ offset: 0, limit: 50 });
    });
  });

  it("applies theming tokens to the log viewer", () => {
    renderOverview();

    expect(document.documentElement.dataset.theme).toBe(AVAILABLE_THEMES[0]);
  });
});

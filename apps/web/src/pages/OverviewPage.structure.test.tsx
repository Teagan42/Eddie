import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { OverviewPage } from "./OverviewPage";
import type {
  OverviewStatsGridProps,
  SessionsListProps,
} from "@eddie/ui/overview";

const sessionsListSpy = vi.fn<(props: SessionsListProps) => void>();
const statsGridSpy = vi.fn<(props: OverviewStatsGridProps) => void>();

vi.mock("@eddie/ui", () => ({
  Panel: ({ children }: { children?: ReactNode }) => <div data-testid="panel">{children}</div>,
}));

vi.mock("@eddie/ui/overview", () => ({
  OverviewHero: () => null,
  OverviewAuthPanel: () => null,
  OverviewStatsGrid: (props: OverviewStatsGridProps) => {
    statsGridSpy(props);
    return null;
  },
  SessionsList: (props: SessionsListProps) => {
    sessionsListSpy(props);
    return null;
  },
  AVAILABLE_THEMES: [],
  formatThemeLabel: (theme: string) => theme,
}));

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ apiKey: "demo", setApiKey: vi.fn() }),
}));

vi.mock("@/theme", () => ({
  useTheme: () => ({ theme: "midnight", setTheme: vi.fn(), isThemeStale: false }),
}));

vi.mock("./hooks", async () => {
  const actual = await vi.importActual<typeof import("./hooks")>("./hooks");
  return {
    ...actual,
    useChatSessionEvents: vi.fn(),
  };
});

vi.mock("@/api/api-provider", () => ({
  useApi: () => ({
    http: {
      chatSessions: {
        list: vi.fn().mockResolvedValue([
          {
            id: "session-1",
            title: "My Session",
            description: "notes",
            status: "active",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T01:02:03.000Z",
          },
        ]),
      },
      traces: {
        list: vi.fn().mockResolvedValue([]),
      },
      logs: {
        list: vi.fn().mockResolvedValue([]),
      },
      config: {
        get: vi.fn().mockResolvedValue({
          apiUrl: "https://api.example.com",
          websocketUrl: "wss://api.example.com",
          theme: "midnight",
          features: {},
        }),
      },
      preferences: {
        getLayout: vi.fn().mockResolvedValue({
          chat: { collapsedPanels: {} },
          updatedAt: new Date().toISOString(),
        }),
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
        onMessageUpdated: vi.fn().mockReturnValue(() => {}),
      },
      traces: {
        onTraceCreated: vi.fn().mockReturnValue(() => {}),
        onTraceUpdated: vi.fn().mockReturnValue(() => {}),
      },
      logs: {
        onLogCreated: vi.fn().mockReturnValue(() => {}),
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

class IntersectionObserverMock implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin = "0px";
  readonly thresholds: ReadonlyArray<number> = [];
  constructor(readonly callback: IntersectionObserverCallback) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe("OverviewPage structure", () => {
  beforeEach(() => {
    sessionsListSpy.mockClear();
    statsGridSpy.mockClear();
    Object.assign(globalThis, {
      ResizeObserver: ResizeObserverMock,
      IntersectionObserver: vi
        .fn<(callback: IntersectionObserverCallback) => IntersectionObserver>()
        .mockImplementation((callback) => new IntersectionObserverMock(callback)),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps chat sessions into session summaries for the shared list", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OverviewPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      const props = sessionsListSpy.mock.calls.at(-1)?.[0];
      expect(props?.sessions).toEqual([
        {
          id: "session-1",
          title: "My Session",
          updatedAt: "2024-01-01T01:02:03.000Z",
        },
      ]);
    });

    await waitFor(() => {
      const statsProps = statsGridSpy.mock.calls.at(-1)?.[0];
      expect(statsProps?.stats?.map((stat) => stat.value)).toContain(1);
    });
  });
});

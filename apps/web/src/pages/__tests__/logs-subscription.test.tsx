import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { LogEntryDto } from "@eddie/api-client";
import { OverviewPage } from "../OverviewPage";

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ apiKey: "test", setApiKey: vi.fn() }),
}));

const logsList = vi.fn<[], Promise<LogEntryDto[]>>().mockResolvedValue([]);
const registerLogListener = vi.fn();

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
        onMessageCreated: vi.fn().mockReturnValue(() => {}),
        onMessageUpdated: vi.fn().mockReturnValue(() => {}),
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

function renderOverview(): {
  emitLog(entry: LogEntryDto): void;
} {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  let handler: ((entry: LogEntryDto) => void) | null = null;
  registerLogListener.mockImplementation((callback: (entry: LogEntryDto) => void) => {
    handler = callback;
    return () => {
      handler = null;
    };
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>
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
  it("does not refetch logs when websocket entries arrive", async () => {
    logsList.mockClear();
    registerLogListener.mockClear();

    const { emitLog } = renderOverview();

    await waitFor(() => {
      expect(registerLogListener).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(logsList).toHaveBeenCalledTimes(1);
    });

    emitLog({
      id: "log-1",
      level: "info",
      message: "streamed",
      createdAt: new Date().toISOString(),
      metadata: {},
    });

    await waitFor(() => {
      expect(logsList).toHaveBeenCalledTimes(1);
    });
  });
});

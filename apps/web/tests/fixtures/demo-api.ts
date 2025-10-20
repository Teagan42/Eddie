import type { Page, TestInfo } from "@playwright/test";
import { AVAILABLE_THEMES, formatThemeLabel } from "../../src/theme";
import type {
  ChatMessageDto,
  ChatSessionDto,
  LogEntryDto,
  RuntimeConfigDto,
  TraceDto,
} from "@eddie/api-client";

interface DemoOverviewState {
  sessions: (ChatSessionDto & { messages: ChatMessageDto[] })[];
  traces: TraceDto[];
  logs: LogEntryDto[];
  config: RuntimeConfigDto;
}

interface ThemeOption {
  value: RuntimeConfigDto["theme"];
  label: string;
}

interface DemoApiFixture {
  waitForHydration(): Promise<void>;
  fetchState(): Promise<DemoOverviewState>;
  captureScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void>;
  pickAlternateTheme(current: RuntimeConfigDto["theme"]): ThemeOption;
}

const DEFAULT_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";
const RAW_API_BASE_URL =
  process.env.PLAYWRIGHT_API_BASE_URL ?? new URL("/api/", ensureTrailingSlash(DEFAULT_BASE_URL)).toString();
const API_BASE_URL = ensureTrailingSlash(RAW_API_BASE_URL);

export function createDemoApiFixture(): DemoApiFixture {
  return {
    waitForHydration,
    fetchState,
    captureScreenshot,
    pickAlternateTheme,
  };
}

async function waitForHydration(): Promise<void> {
  const deadline = Date.now() + 60_000;
  const sessionPath = buildApiUrl("chat-sessions");

  while (Date.now() < deadline) {
    try {
      const response = await fetch(sessionPath, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        await delay();
        continue;
      }

      const sessions = (await response.json()) as ChatSessionDto[];
      if (Array.isArray(sessions) && sessions.length > 0) {
        return;
      }
    } catch {
      // Ignore transient errors during hydration polling.
    }

    await delay();
  }

  throw new Error(`Timed out waiting for demo data from ${sessionPath}`);
}

async function fetchState(): Promise<DemoOverviewState> {
  const [sessions, traces, logs, config] = await Promise.all([
    fetchSessionsWithMessages(),
    fetchJson<TraceDto[]>("traces"),
    fetchJson<LogEntryDto[]>("logs?offset=0&limit=200"),
    fetchJson<RuntimeConfigDto>("config"),
  ]);

  return { sessions, traces, logs, config };
}

async function captureScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const fileName = `${name}.png`;
  const filePath = testInfo.outputPath(fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  await testInfo.attach(name, { path: filePath, contentType: "image/png" });
}

function pickAlternateTheme(current: RuntimeConfigDto["theme"]): ThemeOption {
  const currentIndex = AVAILABLE_THEMES.indexOf(current);
  const nextTheme =
    currentIndex === -1
      ? AVAILABLE_THEMES[0]
      : AVAILABLE_THEMES[(currentIndex + 1) % AVAILABLE_THEMES.length];

  return { value: nextTheme, label: formatThemeLabel(nextTheme) };
}

async function fetchSessionsWithMessages(): Promise<(ChatSessionDto & { messages: ChatMessageDto[] })[]> {
  const sessions = await fetchJson<ChatSessionDto[]>("chat-sessions");
  return Promise.all(
    sessions.map(async (session) => {
      const messages = await fetchJson<ChatMessageDto[]>(`chat-sessions/${session.id}/messages`);
      return { ...session, messages };
    })
  );
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

function buildApiUrl(path: string): string {
  const trimmed = path.replace(/^\/+/, "");
  return new URL(trimmed, API_BASE_URL).toString();
}

function ensureTrailingSlash(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}

function delay(ms: number = 500): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

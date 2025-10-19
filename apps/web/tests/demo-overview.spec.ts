import { expect, test } from "@playwright/test";
import { createDemoApiFixture } from "./fixtures/demo-api";

const demoApi = createDemoApiFixture();

test.beforeAll(async () => {
  await demoApi.waitForHydration();
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("renders seeded chat sessions and transcript", async ({ page }, testInfo) => {
  const state = await demoApi.fetchState();

  await expect(page.getByTestId("overview-hero")).toBeVisible();

  const sessionsList = page.getByTestId("sessions-list");
  await expect(sessionsList).toBeVisible();

  for (const session of state.sessions) {
    await expect(
      sessionsList.getByRole("heading", { name: session.title, level: 3 })
    ).toBeVisible();
  }

  const activeSession = state.sessions[0];
  if (!activeSession) {
    throw new Error("demo preset did not return any chat sessions");
  }

  const messageCards = page.getByTestId("message-card");
  await expect(messageCards).toHaveCount(activeSession.messages.length);

  for (const message of activeSession.messages) {
    await expect(messageCards.filter({ hasText: message.content })).toHaveCount(1);
  }

  await demoApi.captureScreenshot(page, testInfo, "overview-chat-transcript");
});

test("summarizes seeded stats for the demo overview", async ({ page }, testInfo) => {
  const state = await demoApi.fetchState();

  await expect(page.getByTestId("overview-stat-active-sessions")).toContainText(
    String(state.sessions.length)
  );
  await expect(page.getByTestId("overview-stat-live-traces")).toContainText(
    String(state.traces.length)
  );
  await expect(page.getByTestId("overview-stat-log-entries")).toContainText(
    String(state.logs.length)
  );

  await demoApi.captureScreenshot(page, testInfo, "overview-stats");
});

test("paginates logs feed using seeded demo data", async ({ page }, testInfo) => {
  const state = await demoApi.fetchState();

  const logEntries = page.getByTestId("log-entry");
  const initialCount = Math.min(state.logs.length, 50);
  await expect(logEntries).toHaveCount(initialCount);

  if (state.logs.length > initialCount) {
    const scrollArea = page.getByTestId("logs-scroll-area");
    await scrollArea.evaluate((node) => {
      node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    });

    await expect(logEntries).toHaveCount(state.logs.length);
  }

  const latestLog = state.logs[state.logs.length - 1];
  if (latestLog) {
    await expect(logEntries.nth(state.logs.length - 1)).toContainText(latestLog.message);
  }

  await demoApi.captureScreenshot(page, testInfo, "overview-logs");
});

test("syncs theme selector across overview controls", async ({ page }, testInfo) => {
  const state = await demoApi.fetchState();
  const nextTheme = demoApi.pickAlternateTheme(state.config.theme);

  const heroThemeTrigger = page.getByTestId("hero-theme-trigger");
  await heroThemeTrigger.click();
  await page.getByRole("option", { name: nextTheme.label, exact: true }).click();

  await expect(heroThemeTrigger).toContainText(`Theme: ${nextTheme.label}`);
  await expect(page.getByTestId("runtime-theme-trigger")).toContainText(
    `Theme: ${nextTheme.label}`
  );

  await demoApi.captureScreenshot(page, testInfo, `overview-theme-${nextTheme.value}`);
});

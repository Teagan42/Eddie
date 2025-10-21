import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REALTIME_EFFECT_MARKER = "api.sockets.chatSessions.onMessageCreated";
const REQUIRED_REALTIME_DEPENDENCIES = [
  "api",
  "invalidateSessionContext",
  "synchronizeMessageCount",
  "removeDisplayedSessionIds",
  "queryClient",
  "setSessionContext",
  "setSelectedSessionPreference",
] as const;

function loadChatPageSource(): string {
  return readFileSync(resolve(__dirname, "./ChatPage.tsx"), "utf8");
}

describe("ChatPage structure", () => {
  it("wraps the session selector in a Panel", () => {
    const source = loadChatPageSource();

    expect(source).toMatch(
      /<Panel\s*\n\s*title="Sessions"\s*\n\s*description={[\s\S]*?}\s*\n\s*actions={/
    );
  });

  it("wraps the chat window in a Panel", () => {
    const source = loadChatPageSource();

    expect(source).toMatch(
      /<Panel\s*\n\s*title={[\s\S]*?sessions\.find\(\(session\) => session\.id === selectedSessionId\)\?\.title \?\?\s*\n\s*'Select a session'\s*}\s*\n\s*actions={/
    );

    expect(source).toContain(
      `<ChatWindow
              messages={messagesWithMetadata}`
    );
  });

  it("does not include tool or agent hierarchy components", () => {
    const source = loadChatPageSource();

    expect(source).not.toContain("<ToolTree");
    expect(source).not.toContain("<AgentTree");
  });

  it("subscribes socket cleanup with session context updater", () => {
    const source = loadChatPageSource();

    const dependencies = extractRealtimeEffectDependencies(source);

    expect(dependencies).toEqual(expect.arrayContaining([...REQUIRED_REALTIME_DEPENDENCIES]));
  });
});

function extractRealtimeEffectDependencies(source: string): string[] {
  const effectMatch = source.match(
    new RegExp(
      String.raw`useEffect\(\(\) => {[\s\S]*?${REALTIME_EFFECT_MARKER}[\s\S]*?};\s*\n\s*},\s*\[(?<deps>[\s\S]*?)\]\);`,
    ),
  );

  if (!effectMatch?.groups?.deps) {
    throw new Error("Realtime socket effect dependencies could not be determined");
  }

  return effectMatch.groups.deps
    .split("\n")
    .map((line) => line.replace(/\s*\/\/.*$/, ""))
    .map((line) => line.trim().replace(/,$/, ""))
    .filter((line) => line.length > 0);
}

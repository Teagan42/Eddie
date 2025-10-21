import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

    const dependencyPattern = new RegExp(
      String.raw`api,\s*\n\s*invalidateSessionContext,\s*\n\s*synchronizeMessageCount,\s*\n\s*queryClient,\s*\n\s*setSessionContext,\s*\n\s*setSelectedSessionPreference`,
    );

    expect(source).toMatch(dependencyPattern);
  });
});

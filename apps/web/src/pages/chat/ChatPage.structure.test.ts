import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("ChatPage structure", () => {
  it("renders chat without Panel wrappers", () => {
    const source = readFileSync(
      resolve(__dirname, "./ChatPage.tsx"),
      "utf8"
    );

    expect(source).not.toContain("<Panel");
  });

  it("does not include tool or agent hierarchy components", () => {
    const source = readFileSync(
      resolve(__dirname, "./ChatPage.tsx"),
      "utf8"
    );

    expect(source).not.toContain("<ToolTree");
    expect(source).not.toContain("<AgentTree");
  });

  it("subscribes socket cleanup with session context updater", () => {
    const source = readFileSync(
      resolve(__dirname, "./ChatPage.tsx"),
      "utf8"
    );

    const dependencyPattern = new RegExp(
      String.raw`api,\s*\n\s*invalidateSessionContext,\s*\n\s*synchronizeMessageCount,\s*\n\s*queryClient,\s*\n\s*setSessionContext,\s*\n\s*setSelectedSessionPreference`,
    );

    expect(source).toMatch(dependencyPattern);
  });
});

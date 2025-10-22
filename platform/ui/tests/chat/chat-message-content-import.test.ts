import { describe, expect, it } from "vitest";

describe("ChatMessageContent test imports", () => {
  it("resolves the component via the test-relative path", async () => {
    const mod = await import("../chat/ChatMessageContent");
    expect(typeof mod.ChatMessageContent).toBe("function");
  });
});

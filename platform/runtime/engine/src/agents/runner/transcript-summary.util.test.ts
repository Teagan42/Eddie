import { describe, it, expect } from "vitest";

import type { ChatMessage } from "@eddie/types";

import { createTranscriptSummary } from "./transcript-summary.util";

describe("transcript-summary.util", () => {
  const baseMessages: ChatMessage[] = [
    { role: "system", content: "system prompt" },
    { role: "user", content: "  Hello there  " },
    { role: "assistant", content: "How can I help?" },
    { role: "user", content: "Another question" },
  ];

  it("summarises the last two non-empty conversational turns", () => {
    const summary = createTranscriptSummary(baseMessages);

    expect(summary).toBe("Assistant: How can I help? | User: Another question");
  });

  it("returns undefined when no user or assistant content exists", () => {
    const summary = createTranscriptSummary([
      { role: "system", content: "system" },
      { role: "assistant", content: "   " },
    ]);

    expect(summary).toBeUndefined();
  });

  it("truncates summaries longer than 280 characters", () => {
    const longContent = "A".repeat(500);
    const summary = createTranscriptSummary([
      { role: "user", content: longContent },
      { role: "assistant", content: longContent },
    ]);

    expect(summary).toHaveLength(280);
    expect(summary?.endsWith("...")).toBe(true);
  });
});

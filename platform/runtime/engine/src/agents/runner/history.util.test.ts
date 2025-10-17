import { describe, it, expect } from "vitest";

import type { ChatMessage } from "@eddie/types";

import { cloneHistory } from "./history.util";

describe("history.util", () => {
  it("creates a shallow copy of each history message", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ];

    const clone = cloneHistory(history);

    expect(clone).not.toBe(history);
    expect(clone).toEqual(history);
    expect(clone[0]).not.toBe(history[0]);

    clone[0].content = "Changed";

    expect(history[0].content).toBe("Hello");
  });
});

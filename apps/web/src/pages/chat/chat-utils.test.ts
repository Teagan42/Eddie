import { describe, expect, it } from "vitest";

import { summarizeObject } from "./chat-utils";

describe("summarizeObject", () => {
  it("preserves full Unicode characters when truncating plain strings", () => {
    const result = summarizeObject("😀😀", 1);

    expect(result).toBe("😀…");
  });

  it("keeps grapheme clusters intact when truncating complex emoji", () => {
    const familyEmoji = "👨‍👩‍👧‍👦👨‍👩‍👧‍👦";

    const result = summarizeObject(familyEmoji, 1);

    expect(result).toBe("👨‍👩‍👧‍👦…");
  });

  it("preserves surrogate pairs in serialized objects", () => {
    const result = summarizeObject({ text: "😀😀" }, 10);

    expect(result).toBe('{"text":"😀…');
  });
});

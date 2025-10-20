import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("session detail theming", () => {
  it("applies message surface variables for container and cards", () => {
    const source = readFileSync(
      resolve(__dirname, "../../src/chat/SessionDetail.tsx"),
      "utf8",
    );

    expect(source).toContain('bg-[var(--overview-message-overlay)]');
    expect(source).toContain('border-[color:var(--overview-message-border)]');
    expect(source).toContain('bg-[color:var(--overview-message-bg)]');
    expect(source).toContain('text-[color:var(--overview-message-label)]');
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("message composer theming", () => {
  it("uses overview composer variables for surface, input, and action", () => {
    const source = readFileSync(resolve(__dirname, "./MessageComposer.tsx"), "utf8");

    expect(source).toContain('border-[color:var(--overview-composer-border)]');
    expect(source).toContain('bg-[color:var(--overview-composer-bg)]');
    expect(source).toContain('bg-[color:var(--overview-composer-input-bg)]');
    expect(source).toContain('from-[hsl(var(--hero-cta-from))]');
  });
});

import type { StorybookConfig } from "@storybook/react-vite";
import { describe, expect, it } from "vitest";

async function loadConfig(): Promise<StorybookConfig> {
  const mod = await import("../../.storybook/main");
  return (mod.default ?? mod) as StorybookConfig;
}

describe("storybook configuration", () => {
  it("exposes story globs for UI primitives", async () => {
    const config = await loadConfig();

    expect(config.stories).toEqual(
      expect.arrayContaining([
        "../src/**/*.stories.@(ts|tsx)",
        "../src/**/*.mdx",
      ])
    );
  });
});

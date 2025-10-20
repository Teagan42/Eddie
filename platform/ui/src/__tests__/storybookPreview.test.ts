import { describe, expect, it } from "vitest";

describe("storybook preview", () => {
  it("includes dark background for surface parity", async () => {
    const mod = await import("../../.storybook/preview");
    const backgrounds = mod.STORYBOOK_BACKGROUNDS as readonly { name: string }[];
    const values = (mod.default?.parameters?.backgrounds?.values ?? []) as { name: string }[];

    expect(backgrounds).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "dark" })])
    );
    expect(values).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "dark" })])
    );
  });
});

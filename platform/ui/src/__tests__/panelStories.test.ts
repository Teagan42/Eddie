import { describe, expect, it } from "vitest";

describe("Panel stories", () => {
  it("provides panel showcase variations", async () => {
    const stories = await import("../common/Panel.stories");
    const meta = stories.default;

    expect(meta?.title).toMatch(/Panel/);
    expect(typeof stories.Default).toBe("object");
    expect(typeof stories.Loading).toBe("object");
  });
});

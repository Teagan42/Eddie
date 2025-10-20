import { describe, expect, it } from "vitest";

describe("MessageComposer stories", () => {
  it("exposes disabled and loading variations", async () => {
    const stories = await import("../chat/MessageComposer.stories");
    const meta = stories.default;

    expect(meta.title).toMatch(/Message Composer/);
    expect(stories.Default.args?.disabled).toBe(false);
    expect(stories.Loading.args?.disabled).toBe(true);
    expect(typeof stories.WithPlaceholder.args?.placeholder).toBe("string");
  });
});

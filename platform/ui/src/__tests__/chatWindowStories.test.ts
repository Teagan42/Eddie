import { describe, expect, it } from "vitest";

describe("ChatWindow stories", () => {
  it("provides object controls for session metrics", async () => {
    const stories = await import("../chat/ChatWindow.stories");
    const meta = stories.default;

    expect(meta.argTypes?.sessionMetrics?.control?.type).toBe("object");
    expect(Array.isArray(stories.Empty.args?.messages)).toBe(true);
    expect(stories.SessionMetrics.args?.sessionMetrics).toMatchObject({
      tokensConsumed: expect.any(Number),
    });
  });
});

import { describe, expect, it } from "vitest";

import { InMemoryChatSessionsRepository } from "../../../src/chat-sessions/chat-sessions.repository";

describe("InMemoryChatSessionsRepository", () => {
  it("updates metadata with new title and description", async () => {
    const repository = new InMemoryChatSessionsRepository();
    const session = await repository.createSession({
      title: "Original",
      description: "First",
    });

    const updated = await repository.updateSessionMetadata(session.id, {
      title: "Updated",
      description: "Second",
    });

    expect(updated?.title).toBe("Updated");
    expect(updated?.description).toBe("Second");
    expect(updated?.updatedAt.getTime()).toBeGreaterThan(
      session.updatedAt.getTime()
    );

    const stored = await repository.getSessionById(session.id);
    expect(stored?.title).toBe("Updated");
    expect(stored?.description).toBe("Second");
    expect(stored?.updatedAt.getTime()).toBe(updated?.updatedAt.getTime());
  });

  it("returns undefined when metadata update targets missing session", async () => {
    const repository = new InMemoryChatSessionsRepository();

    const result = await repository.updateSessionMetadata("missing", {
      title: "Updated",
    });

    expect(result).toBeUndefined();
  });
});

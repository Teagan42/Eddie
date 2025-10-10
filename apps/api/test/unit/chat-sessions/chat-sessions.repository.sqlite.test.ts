import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  SqliteChatSessionsRepository,
  type ChatSessionsRepository,
} from "../../../src/chat-sessions/chat-sessions.repository";
import { ChatMessageRole } from "../../../src/chat-sessions/dto/create-chat-message.dto";

const createFilename = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), "eddie-sqlite-repo-"));
  return path.join(dir, "chat.sqlite");
};

describe("SqliteChatSessionsRepository", () => {
  const createdDirs: string[] = [];
  let repository: ChatSessionsRepository;

  beforeEach(() => {
    const filename = createFilename();
    createdDirs.push(path.dirname(filename));
    repository = new SqliteChatSessionsRepository({ filename });
  });

  afterAll(() => {
    for (const dir of createdDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup failures
      }
    }
  });

  it("creates sessions and appends messages", async () => {
    const session = await repository.createSession({ title: "Sqlite" });
    const { message, session: updated } = (await repository.appendMessage({
      sessionId: session.id,
      role: ChatMessageRole.User,
      content: "Hi",
    }))!;

    expect(message.sessionId).toBe(session.id);
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
      session.createdAt.getTime()
    );
    await expect(repository.listMessages(session.id)).resolves.toEqual([
      expect.objectContaining({ content: "Hi" }),
    ]);
  });

  it("updates message content and preserves ordering", async () => {
    const session = await repository.createSession({ title: "Updates" });
    const first = (await repository.appendMessage({
      sessionId: session.id,
      role: ChatMessageRole.User,
      content: "First",
    }))!.message;
    await repository.appendMessage({
      sessionId: session.id,
      role: ChatMessageRole.Assistant,
      content: "Second",
    });

    const updated = await repository.updateMessageContent(
      session.id,
      first.id,
      "First - edited"
    );

    expect(updated?.content).toBe("First - edited");
    const contents = await repository.listMessages(session.id);
    expect(contents.map((item) => item.content)).toEqual([
      "First - edited",
      "Second",
    ]);
  });

  it("stores agent invocation snapshots", async () => {
    const session = await repository.createSession({ title: "Invocations" });
    await repository.saveAgentInvocations(session.id, [
      {
        id: "root",
        messages: [
          {
            role: ChatMessageRole.Assistant,
            content: "Plan",
          },
        ],
        children: [
          {
            id: "child",
            messages: [
              {
                role: ChatMessageRole.Tool,
                content: "{}",
                toolCallId: "call-1",
              },
            ],
            children: [],
          },
        ],
      },
    ]);

    await expect(repository.listAgentInvocations(session.id)).resolves.toEqual([
      {
        id: "root",
        messages: [
          {
            role: ChatMessageRole.Assistant,
            content: "Plan",
          },
        ],
        children: [
          {
            id: "child",
            messages: [
              {
                role: ChatMessageRole.Tool,
                content: "{}",
                toolCallId: "call-1",
              },
            ],
            children: [],
          },
        ],
      },
    ]);

    await repository.saveAgentInvocations(session.id, []);

    await expect(repository.listAgentInvocations(session.id)).resolves.toEqual([]);
  });
});

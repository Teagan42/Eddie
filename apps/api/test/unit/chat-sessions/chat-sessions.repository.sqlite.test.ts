import knex, { type Knex } from "knex";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KnexChatSessionsRepository } from "../../../src/chat-sessions/chat-sessions.repository";
import { ChatMessageRole } from "../../../src/chat-sessions/dto/create-chat-message.dto";

const createFilename = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), "eddie-sqlite-repo-"));
  return path.join(dir, "chat.sqlite");
};

describe("KnexChatSessionsRepository (sqlite)", () => {
  const createdDirs: string[] = [];
  let database: Knex;
  let repository: KnexChatSessionsRepository;

  beforeEach(() => {
    const filename = createFilename();
    createdDirs.push(path.dirname(filename));
    database = knex({
      client: "better-sqlite3",
      connection: {
        filename,
      },
      useNullAsDefault: true,
    });
    repository = new KnexChatSessionsRepository({
      knex: database,
      ownsConnection: true,
    });
  });

  afterEach(async () => {
    if (repository) {
      await repository.onModuleDestroy();
    }
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
    await expect(
      repository
        .listMessages(session.id)
        .then((items) => items.map((item) => item.content))
    ).resolves.toEqual(["First - edited", "Second"]);
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

  it("destroys the owned knex instance when the module is destroyed", async () => {
    const destroySpy = vi.spyOn(database, "destroy");

    await repository.onModuleDestroy();

    expect(destroySpy).toHaveBeenCalled();
  });

});

describe("KnexChatSessionsRepository teardown", () => {
  it("swallows aborted errors when destroying the owned connection", async () => {
    const destroy = vi
      .fn()
      .mockRejectedValueOnce(new Error("aborted"))
      .mockResolvedValue(undefined as never);

    const stubKnex = {
      destroy,
      client: { config: { client: "better-sqlite3" } },
    } as unknown as Knex;

    const repo = new KnexChatSessionsRepository({
      knex: stubKnex,
      ownsConnection: true,
      migrations: [],
    });

    await expect(repo.onModuleDestroy()).resolves.toBeUndefined();

    expect(destroy).toHaveBeenCalled();
  });
});

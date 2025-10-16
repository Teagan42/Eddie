import knex, { type Knex } from "knex";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { ChatMessageRole } from "../../../src/chat-sessions/dto/create-chat-message.dto";
import { KnexChatSessionsRepository } from "../../../src/chat-sessions/chat-sessions.repository";
import { StartToolCallCommand } from "../../../src/tools/commands/start-tool-call.command";
import { UpdateToolCallCommand } from "../../../src/tools/commands/update-tool-call.command";
import { CompleteToolCallCommand } from "../../../src/tools/commands/complete-tool-call.command";
import { StartToolCallHandler } from "../../../src/tools/commands/start-tool-call.handler";
import { UpdateToolCallHandler } from "../../../src/tools/commands/update-tool-call.handler";
import { CompleteToolCallHandler } from "../../../src/tools/commands/complete-tool-call.handler";
import { ToolCallStore } from "../../../src/tools/tool-call.store";
import { ToolCallPersistenceService } from "../../../src/tools/tool-call.persistence";

const createFilename = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), "eddie-tool-call-sqlite-"));
  return path.join(dir, "chat.sqlite");
};

describe("Tool call persistence (sqlite)", () => {
  const createdDirs: string[] = [];
  let database: Knex;
  let repository: KnexChatSessionsRepository;
  let persistence: ToolCallPersistenceService;
  let startHandler: StartToolCallHandler;
  let updateHandler: UpdateToolCallHandler;
  let completeHandler: CompleteToolCallHandler;

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
    repository = new KnexChatSessionsRepository({ knex: database, ownsConnection: true });
    persistence = new ToolCallPersistenceService(database);
    const store = new ToolCallStore();
    startHandler = new StartToolCallHandler(store, { publish: () => undefined } as never, persistence);
    updateHandler = new UpdateToolCallHandler(store, { publish: () => undefined } as never, persistence);
    completeHandler = new CompleteToolCallHandler(store, { publish: () => undefined } as never, persistence);
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

  it("stores lifecycle records and links chat messages", async () => {
    const session = await repository.createSession({ title: "Persistence" });

    await startHandler.execute(
      new StartToolCallCommand({
        sessionId: session.id,
        toolCallId: "call-1",
        agentId: "agent-1",
        name: "search",
        arguments: { query: "docs" },
        timestamp: "2024-01-01T00:00:00.000Z",
      })
    );

    await updateHandler.execute(
      new UpdateToolCallCommand({
        sessionId: session.id,
        toolCallId: "call-1",
        arguments: { query: "docs", page: 2 },
        timestamp: "2024-01-01T00:00:05.000Z",
        agentId: "agent-1",
      })
    );

    let callRow = await database("tool_calls")
      .where({ session_id: session.id, tool_call_id: "call-1" })
      .first();

    expect(callRow).toMatchObject({
      session_id: session.id,
      tool_call_id: "call-1",
      name: "search",
      status: "running",
      agent_id: "agent-1",
    });
    expect(callRow.agent_id).toBe("agent-1");
    expect(JSON.parse(callRow.arguments)).toEqual({ query: "docs", page: 2 });

    const callMessage = (await repository.appendMessage({
      sessionId: session.id,
      role: ChatMessageRole.Assistant,
      content: "Calling search",
      toolCallId: "call-1",
    }))!.message;

    callRow = await database("tool_calls")
      .where({ session_id: session.id, tool_call_id: "call-1" })
      .first();

    expect(callRow.message_id).toBe(callMessage.id);

    await completeHandler.execute(
      new CompleteToolCallCommand({
        sessionId: session.id,
        toolCallId: "call-1",
        name: "search",
        result: { items: ["a"] },
        timestamp: "2024-01-01T00:00:10.000Z",
        agentId: "agent-1",
      })
    );

    let resultRow = await database("tool_results")
      .where({ session_id: session.id, tool_call_id: "call-1" })
      .first();

    expect(resultRow).toMatchObject({
      session_id: session.id,
      tool_call_id: "call-1",
      name: "search",
      agent_id: "agent-1",
    });
    expect(resultRow.agent_id).toBe("agent-1");
    expect(JSON.parse(resultRow.result)).toEqual({ items: ["a"] });

    const resultMessage = (await repository.appendMessage({
      sessionId: session.id,
      role: ChatMessageRole.Tool,
      content: "{\"items\":[\"a\"]}",
      toolCallId: "call-1",
    }))!.message;

    resultRow = await database("tool_results")
      .where({ session_id: session.id, tool_call_id: "call-1" })
      .first();

    expect(resultRow.message_id).toBe(resultMessage.id);
    expect(resultRow.updated_at).not.toBeNull();

    callRow = await database("tool_calls")
      .where({ session_id: session.id, tool_call_id: "call-1" })
      .first();

    expect(callRow.status).toBe("completed");
  });

  it("allows multiple tool calls without external identifier", async () => {
    const session = await repository.createSession({ title: "Anonymous calls" });

    await startHandler.execute(
      new StartToolCallCommand({
        sessionId: session.id,
        name: "search",
        arguments: { query: "first" },
        timestamp: "2024-01-01T00:00:00.000Z",
        agentId: "agent-1",
      })
    );

    await startHandler.execute(
      new StartToolCallCommand({
        sessionId: session.id,
        name: "search",
        arguments: { query: "second" },
        timestamp: "2024-01-01T00:00:05.000Z",
        agentId: "agent-2",
      })
    );

    const rows = await database("tool_calls")
      .where({ session_id: session.id })
      .orderBy("created_at");

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.tool_call_id === null)).toBe(true);
    expect(rows.map((row) => row.agent_id)).toEqual(["agent-1", "agent-2"]);
    expect(rows.map((row) => JSON.parse(row.arguments))).toEqual([
      { query: "first" },
      { query: "second" },
    ]);
  });

  it("merges lifecycle rows for anonymous tool calls", async () => {
    const session = await repository.createSession({ title: "Anonymous lifecycle" });

    await startHandler.execute(
      new StartToolCallCommand({
        sessionId: session.id,
        name: "search",
        arguments: { query: "single" },
        timestamp: "2024-01-01T00:00:00.000Z",
        agentId: "agent-1",
      })
    );

    await completeHandler.execute(
      new CompleteToolCallCommand({
        sessionId: session.id,
        name: "search",
        result: { items: ["a"] },
        timestamp: "2024-01-01T00:00:10.000Z",
        agentId: "agent-1",
      })
    );

    const callRows = await database("tool_calls")
      .where({ session_id: session.id })
      .orderBy("created_at");
    const resultRows = await database("tool_results")
      .where({ session_id: session.id })
      .orderBy("created_at");

    expect(callRows).toHaveLength(1);
    expect(callRows[0]).toMatchObject({
      status: "completed",
      name: "search",
    });
    expect(JSON.parse(callRows[0].arguments)).toEqual({ query: "single" });
    expect(callRows[0].agent_id).toBe("agent-1");
    expect(resultRows).toHaveLength(1);
    expect(JSON.parse(resultRows[0].result)).toEqual({ items: ["a"] });
  });
});

import { describe, expect, it, vi } from "vitest";
import type { JsonlWriterEvent, LoggerService, JsonlWriterService } from "@eddie/io";
import type { CommandBus } from "@nestjs/cqrs";
import { LogsForwarderService } from "../../../src/logs/logs-forwarder.service";
import { LogsService } from "../../../src/logs/logs.service";
import { StartToolCallCommand } from "../../../src/tools/commands/start-tool-call.command";
import { CompleteToolCallCommand } from "../../../src/tools/commands/complete-tool-call.command";

const createService = (commandBus?: CommandBus) => {
  const loggerService = { registerListener: vi.fn() } as unknown as LoggerService;
  const jsonlWriter = { registerListener: vi.fn() } as unknown as JsonlWriterService;
  const logs = { append: vi.fn() } as unknown as LogsService;
  const bus = commandBus ?? ({ execute: vi.fn() } as unknown as CommandBus);
  return { service: new LogsForwarderService(loggerService, jsonlWriter, logs, bus), logs, bus };
};

describe("LogsForwarderService", () => {
  it.skip("dispatches tool lifecycle commands for trace events", () => {
    const { service, bus } = createService();
    const execute = bus.execute as unknown as ReturnType<typeof vi.fn>;

    const toolCallEvent: JsonlWriterEvent = {
      filePath: "trace.jsonl",
      append: true,
      event: {
        phase: "tool_call",
        sessionId: "s1",
        agent: { id: "agent-123" },
        data: {
          id: "t1",
          name: "search",
          arguments: { query: "hi" },
        },
      },
    } as unknown as JsonlWriterEvent;

    const toolResultEvent: JsonlWriterEvent = {
      filePath: "trace.jsonl",
      append: true,
      event: {
        phase: "tool_result",
        sessionId: "s1",
        agent: { id: "agent-123" },
        data: {
          id: "t1",
          name: "search",
          arguments: { query: "hi", page: 2 },
          result: { items: [] },
        },
      },
    } as unknown as JsonlWriterEvent;

    // @ts-expect-error accessing private method for test coverage
    service.handleJsonlEvent(toolCallEvent);
    // @ts-expect-error accessing private method for test coverage
    service.handleJsonlEvent(toolResultEvent);

    const [ startCommand ] = execute.mock.calls[0] ?? [];
    expect(startCommand).toBeInstanceOf(StartToolCallCommand);
    expect(startCommand.input).toEqual({
      sessionId: "s1",
      toolCallId: "t1",
      name: "search",
      arguments: { query: "hi" },
      timestamp: expect.any(String),
      agentId: "agent-123",
    });

    const [ completeCommand ] = execute.mock.calls[1] ?? [];
    expect(completeCommand).toBeInstanceOf(CompleteToolCallCommand);
    expect(completeCommand.input).toMatchObject({
      sessionId: "s1",
      toolCallId: "t1",
      name: "search",
      result: { items: [] },
      timestamp: expect.any(String),
      agentId: "agent-123",
      arguments: { query: "hi", page: 2 },
    });
  });

  it("does not dispatch tool commands when trace lacks session id", () => {
    const bus = {
      execute: vi.fn(),
    } as unknown as CommandBus;
    const { service } = createService(bus);
    const event: JsonlWriterEvent = {
      filePath: "trace.jsonl",
      append: true,
      event: {
        phase: "tool_call",
        agent: { id: "agent-456" },
        data: {
          id: "call-1",
          name: "search",
          arguments: { query: "hi" },
        },
      },
    } as unknown as JsonlWriterEvent;

    // @ts-expect-error accessing private method for targeted coverage
    service.handleJsonlEvent(event);

    const execute = bus.execute as unknown as ReturnType<typeof vi.fn>;
    expect(execute).not.toHaveBeenCalled();
  });
});

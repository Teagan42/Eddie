import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  JsonlWriterEvent,
  JsonlWriterService,
  LoggerEvent,
  LoggerService,
} from "@eddie/io";
import { getLoggerToken } from "@eddie/io";
import { SELF_DECLARED_DEPS_METADATA } from "@nestjs/common/constants";
import { LogsForwarderService } from "../../../src/logs/logs-forwarder.service";
import type { LogsService } from "../../../src/logs/logs.service";

describe("LogsForwarderService", () => {
  let loggerRegister: ReturnType<typeof vi.fn>;
  let jsonlRegister: ReturnType<typeof vi.fn>;
  let logsAppend: ReturnType<typeof vi.fn>;
  let forwarder: LogsForwarderService;
  let loggerListener: ((event: LoggerEvent) => void) | undefined;
  let jsonlListener: ((event: JsonlWriterEvent) => void) | undefined;

  beforeEach(() => {
    loggerListener = undefined;
    jsonlListener = undefined;

    loggerRegister = vi.fn((listener: (event: LoggerEvent) => void) => {
      loggerListener = listener;
      return () => {
        loggerListener = undefined;
      };
    });

    jsonlRegister = vi.fn((listener: (event: JsonlWriterEvent) => void) => {
      jsonlListener = listener;
      return () => {
        jsonlListener = undefined;
      };
    });

    const logger = {
      registerListener: loggerRegister,
    } as unknown as LoggerService;

    const writer = {
      registerListener: jsonlRegister,
    } as unknown as JsonlWriterService;

    logsAppend = vi.fn();
    const logs = {
      append: logsAppend,
    } as unknown as LogsService;

    forwarder = new LogsForwarderService(logger, writer, logs, logger);
  });

  it("registers listeners and forwards logger events", () => {
    forwarder.onModuleInit();

    expect(loggerRegister).toHaveBeenCalledTimes(1);

    loggerListener?.({
      level: "info",
      args: [{ foo: "bar" }, "hello", 42],
    });

    expect(logsAppend).toHaveBeenCalledWith(
      "info",
      "hello",
      expect.objectContaining({
        foo: "bar",
        arguments: [42],
      })
    );
  });

  it("forwards jsonl writer events into logs", () => {
    forwarder.onModuleInit();

    const payload: JsonlWriterEvent["event"] = {
      phase: "agent_complete",
      timestamp: "2024-01-01T00:00:00.000Z",
    };

    jsonlListener?.({
      filePath: "/tmp/run.jsonl",
      event: payload,
      append: true,
    });

    expect(logsAppend).toHaveBeenCalledWith(
      "info",
      "Trace agent_complete",
      expect.objectContaining({
        filePath: "/tmp/run.jsonl",
        append: true,
        phase: "agent_complete",
        timestamp: "2024-01-01T00:00:00.000Z",
      })
    );
  });

  it("derives the message from logger context payloads", () => {
    forwarder.onModuleInit();

    loggerListener?.({
      level: "debug",
      args: [
        {
          msg: "context message",
          scope: "test",
        },
      ],
    });

    expect(logsAppend).toHaveBeenCalledWith(
      "debug",
      "context message",
      expect.objectContaining({ scope: "test" })
    );
  });

  it("cleans up listeners on destroy", () => {
    forwarder.onModuleInit();

    forwarder.onModuleDestroy();

    expect(loggerListener).toBeUndefined();
    expect(jsonlListener).toBeUndefined();
  });

  it("decorates the logger dependency with InjectLogger", () => {
    const metadata =
      (Reflect.getMetadata(
        SELF_DECLARED_DEPS_METADATA,
        LogsForwarderService
      ) as Array<{ index: number; param?: unknown }>) ?? [];

    const dependency = metadata.find((entry) => entry.index === 0);

    expect(dependency?.param).toBe(getLoggerToken());
  });
});

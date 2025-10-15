import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import {
  JsonlWriterEvent,
  JsonlWriterService,
  LoggerEvent,
  LoggerService,
} from "@eddie/io";
import { LogsService } from "./logs.service";
import {
  CompleteToolCallCommand,
  StartToolCallCommand,
} from "../tools/commands";
import type { LogEntryDto } from "./dto/log-entry.dto";

type RegisteredDisposer = () => void;

type AppendLevel = LogEntryDto[ "level" ];

const LOG_LEVEL_MAP: Record<LoggerEvent[ "level" ], AppendLevel> = {
  fatal: "error",
  error: "error",
  warn: "warn",
  info: "info",
  debug: "debug",
  trace: "trace",
};

@Injectable()
export class LogsForwarderService implements OnModuleInit, OnModuleDestroy {
  private unregisterLogger: RegisteredDisposer | null = null;
  private unregisterJsonl: RegisteredDisposer | null = null;

  constructor(
        private readonly loggerService: LoggerService,
        private readonly jsonlWriter: JsonlWriterService,
        private readonly logs: LogsService,
        @Optional() private readonly commandBus?: CommandBus,
  ) { }

  onModuleInit(): void {
    if (typeof this.loggerService?.registerListener === "function") {
      this.unregisterLogger = this.loggerService.registerListener((event) =>
        this.handleLoggerEvent(event)
      );
    }

    if (typeof this.jsonlWriter?.registerListener === "function") {
      this.unregisterJsonl = this.jsonlWriter.registerListener((event) =>
        this.handleJsonlEvent(event)
      );
    }
  }

  onModuleDestroy(): void {
    this.unregisterLogger?.();
    this.unregisterLogger = null;
    this.unregisterJsonl?.();
    this.unregisterJsonl = null;
  }

  private handleLoggerEvent(event: LoggerEvent): void {
    const [ first, ...rest ] = event.args;
    let context: Record<string, unknown> | undefined;
    let messageSource: unknown = first;
    let remaining = rest;

    if (this.isPlainObject(first)) {
      context = { ...(first as Record<string, unknown>) };
      if (rest.length > 0) {
        [ messageSource, ...remaining ] = rest;
      } else {
        messageSource = undefined;
        remaining = [];
      }
    }

    let message = this.resolveMessage(messageSource, event.level);

    if (context && messageSource === undefined) {
      for (const key of [ "msg", "message" ]) {
        const candidate = context[ key ];
        if (candidate === undefined) {
          continue;
        }

        message = this.resolveMessage(candidate, event.level);
        delete context[ key ];
        break;
      }

      if (Object.keys(context).length === 0) {
        context = undefined;
      }
    }

    if (remaining.length > 0) {
      context = {
        ...(context ?? {}),
        arguments: remaining,
      };
    }

    if (!context || Object.keys(context).length === 0) {
      this.logs.append(LOG_LEVEL_MAP[ event.level ], message);
      return;
    }

    this.logs.append(LOG_LEVEL_MAP[ event.level ], message, context);
  }

  private handleJsonlEvent(event: JsonlWriterEvent): void {
    const payloadContext: Record<string, unknown> = {
      filePath: event.filePath,
      append: event.append,
    };

    if (this.isPlainObject(event.event)) {
      Object.assign(payloadContext, event.event as Record<string, unknown>);
    } else {
      payloadContext.value = event.event;
    }

    const phase =
            typeof (event.event as { phase?: unknown; })?.phase === "string"
              ? ((event.event as { phase: string; }).phase as string)
              : undefined;

    const message = phase ? `Trace ${ phase }` : "Trace event written";

    this.logs.append("info", message, payloadContext);

    // If the JSONL trace contains a tool_call or tool_result phase, forward it to the ToolsGateway
    if (phase === "tool_call" || phase === "tool_result") {
      try {
        // Normalize tool payload so sessionId/id/name are top-level for the UI
        const raw = this.isPlainObject(event.event) ? (event.event as Record<string, unknown>) : { value: event.event };
        const data = this.isPlainObject(raw.data) ? (raw.data as Record<string, unknown>) : undefined;
        const sessionId = (raw.sessionId as string) ?? (payloadContext.sessionId as string) ?? (raw.agent && (raw.agent as any).id) ?? undefined;
        const id = (data && (data.id as string)) ?? (raw.id as string) ?? undefined;
        const name = (data && (data.name as string)) ?? (raw.name as string) ?? undefined;
        const args = (data && (data.arguments ?? data.args)) ?? (raw.arguments ?? raw.args) ?? undefined;
        const result = (data && (data.result)) ?? (raw.result) ?? undefined;

        if (typeof sessionId !== "string" || sessionId.length === 0) {
          return;
        }

        // Prefer any timestamp present in the trace payload (data or raw),
        // otherwise fall back to the current time.
        const rawTimestamp = (data && (data.timestamp ?? data.time ?? data.ts)) ?? (raw.timestamp ?? raw.time ?? raw.ts);
        let timestampIso: string | null = null;
        if (typeof rawTimestamp === 'number') {
          try { timestampIso = new Date(rawTimestamp).toISOString(); } catch { timestampIso = null; }
        } else if (typeof rawTimestamp === 'string') {
          timestampIso = rawTimestamp;
        }
        const timestamp = timestampIso ?? new Date().toISOString();

        if (phase === "tool_call") {
          this.dispatchToolCommand(
            new StartToolCallCommand({
              sessionId,
              toolCallId: id ?? undefined,
              name: name ?? undefined,
              arguments: args ?? null,
              timestamp,
            })
          );
        } else {
          this.dispatchToolCommand(
            new CompleteToolCallCommand({
              sessionId,
              toolCallId: id ?? undefined,
              name: name ?? undefined,
              result: result ?? null,
              timestamp,
            })
          );
        }
      } catch {
        // swallow errors
      }
    }
  }

  private resolveMessage(source: unknown, level: LoggerEvent[ "level" ]): string {
    if (typeof source === "string") {
      return source;
    }

    if (source instanceof Error) {
      return source.message;
    }

    if (source === undefined) {
      return `Logger ${ level }`;
    }

    try {
      return JSON.stringify(source);
    } catch {
      return String(source);
    }
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
      typeof value === "object" &&
            value !== null &&
            !Array.isArray(value) &&
            Object.getPrototypeOf(value) === Object.prototype
    );
  }

  private dispatchToolCommand(
    command: StartToolCallCommand | CompleteToolCallCommand
  ): void {
    if (!this.commandBus) {
      return;
    }
    try {
      void this.commandBus.execute(command);
    } catch {
      // swallow errors to keep log forwarding resilient
    }
  }

}

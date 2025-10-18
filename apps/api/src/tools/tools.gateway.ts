import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server } from "ws";
import { emitEvent } from "../websocket/utils";

/**
 * Lightweight gateway for streaming tool call/result events to the web UI.
 * Path: /tools
 */
@WebSocketGateway({ path: "/tools" })
export class ToolsGateway implements OnModuleInit, OnModuleDestroy {
    @WebSocketServer()
  private server!: Server;

    private safeStringify(value: unknown, maxLen = 2000): string | null {
      try {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string') return value.length > maxLen ? value.slice(0, maxLen) + '…' : value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        const str = JSON.stringify(value);
        return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
      } catch {
        try {
          return String(value);
        } catch {
          return null;
        }
      }
    }

    onModuleInit(): void {
      // no-op: kept for symmetry with other gateways
    }

    onModuleDestroy(): void {
      // no-op
    }

    emitToolCall(payload: unknown): void {
      this.emitSafely('tool.call', payload);
    }

    emitToolResult(payload: unknown): void {
      this.emitSafely('tool.result', payload);
    }

    private emitSafely(event: 'tool.call' | 'tool.result', payload: unknown): void {
      try {
        const server = this.server ?? null;
        emitEvent(server, event, this.preparePayload(payload));
      } catch {
        // swallow errors
      }
    }

    private preparePayload(payload: unknown): unknown {
      if (!payload || typeof payload !== 'object') {
        return payload;
      }

      const prepared = { ...(payload as Record<string, unknown>) };

      if ('arguments' in prepared) {
        prepared.arguments = this.safeStringify(prepared.arguments) as unknown;
      }

      if ('result' in prepared) {
        prepared.result = this.safeStringify(prepared.result) as unknown;
      }

      const agentId = this.sanitizeAgentId(prepared.agentId);
      if (agentId !== undefined) {
        prepared.agentId = agentId;
      }

      if (!('timestamp' in prepared) || !prepared.timestamp) {
        prepared.timestamp = new Date().toISOString();
      }

      return prepared;
    }

    private sanitizeAgentId(value: unknown): string | null | undefined {
      if (value === undefined) {
        return undefined;
      }
      if (typeof value !== 'string') {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
}

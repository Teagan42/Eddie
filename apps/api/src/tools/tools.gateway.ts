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
        try {
            const safePayload = ((): unknown => {
                if (!payload || typeof payload !== 'object') return payload;
                const p = { ...(payload as Record<string, unknown>) } as Record<string, unknown>;
                if ('arguments' in p) {
                    p.arguments = this.safeStringify(p.arguments) as unknown;
                }
                if ('result' in p) {
                    p.result = this.safeStringify(p.result) as unknown;
                }
                if (!('timestamp' in p) || !p.timestamp) {
                    p.timestamp = new Date().toISOString();
                }
                return p;
            })();

            // Tool call emitted (debug logging removed in cleanup)
            emitEvent(this.server, 'tool.call', safePayload);
        } catch {
            // swallow errors
        }
    }

    emitToolResult(payload: unknown): void {
        try {
            const safePayload = ((): unknown => {
                if (!payload || typeof payload !== 'object') return payload;
                const p = { ...(payload as Record<string, unknown>) } as Record<string, unknown>;
                if ('arguments' in p) {
                    p.arguments = this.safeStringify(p.arguments) as unknown;
                }
                if ('result' in p) {
                    p.result = this.safeStringify(p.result) as unknown;
                }
                if (!('timestamp' in p) || !p.timestamp) {
                    p.timestamp = new Date().toISOString();
                }
                return p;
            })();

            // Tool result emitted (debug logging removed in cleanup)
            emitEvent(this.server, 'tool.result', safePayload);
        } catch {
            // swallow errors
        }
    }
}

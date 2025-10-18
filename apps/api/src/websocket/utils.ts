import { WebSocket } from "ws";
import type { Server } from "ws";

interface OutboundEvent<T = unknown> {
  event: string;
  data: T;
}

export function emitEvent<T>(
  server: Server | null | undefined,
  event: string,
  payload: T
): void {
  if (!server) {
    return;
  }

  const message: OutboundEvent<T> = { event, data: payload };
  const encoded = JSON.stringify(message);

  for (const client of server.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(encoded);
    }
  }
}

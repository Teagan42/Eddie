import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter } from "events";
import type { HookEventMap, HookEventName, HookListener } from "./types";

@Injectable()
export class HookBus extends EventEmitter {
  private readonly logger = new Logger(HookBus.name);

  async emitAsync<K extends HookEventName>(
    event: K,
    payload: HookEventMap[K]
  ): Promise<void> {
    const listeners = this.listeners(event) as HookListener<K>[];

    for (const listener of listeners) {
      try {
        await Promise.resolve(listener(payload));
      } catch (error) {
        if (error instanceof Error) {
          this.logger.error(
            `Hook "${event}" failed: ${error.message}`,
            error.stack
          );
        } else {
          this.logger.error(`Hook "${event}" failed: ${String(error)}`);
        }
      }
    }
  }

  override on<K extends HookEventName>(
    event: K,
    listener: HookListener<K>
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }
}

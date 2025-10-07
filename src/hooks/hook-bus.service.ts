import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter } from "events";
import type {
  HookDispatchResult,
  HookEventMap,
  HookEventName,
  HookListener,
  HookListenerResult,
} from "./types";
import { isHookBlockResponse } from "./types";

@Injectable()
export class HookBus extends EventEmitter {
  private readonly logger = new Logger(HookBus.name);

  async emitAsync<K extends HookEventName>(
    event: K,
    payload: HookEventMap[K]
  ): Promise<HookDispatchResult<K>> {
    const listeners = this.listeners(event) as HookListener<K>[];
    const results: HookListenerResult<K>[] = [];

    for (const listener of listeners) {
      try {
        const result = (await Promise.resolve(
          listener(payload)
        )) as HookListenerResult<K>;
        results.push(result);

        if (isHookBlockResponse(result)) {
          return { results, blocked: result };
        }
      } catch (error) {
        if (error instanceof Error) {
          this.logger.error(
            `Hook "${event}" failed: ${error.message}`,
            error.stack
          );
        } else {
          this.logger.error(`Hook "${event}" failed: ${String(error)}`);
        }

        return { results, error };
      }
    }

    return { results };
  }

  override on<K extends HookEventName>(
    event: K,
    listener: HookListener<K>
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }
}

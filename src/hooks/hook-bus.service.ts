import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter } from "events";

type HookListener = (payload?: unknown) => unknown | Promise<unknown>;

@Injectable()
export class HookBus extends EventEmitter {
  private readonly logger = new Logger(HookBus.name);

  async emitAsync(event: string, payload?: unknown): Promise<void> {
    const listeners = this.listeners(event) as HookListener[];

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
}

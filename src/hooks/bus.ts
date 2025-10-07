import { EventEmitter } from "events";

export class HookBus extends EventEmitter {
  async emitAsync(event: string, payload?: unknown): Promise<void> {
    const listeners = this.listeners(event);
    for (const listener of listeners) {
      await Promise.resolve()
        .then(() => (listener as (arg?: unknown) => unknown)(payload))
        .catch((error) => {
      console.error(`Hook "${event}" failed`, error);
        });
    }
  }
}

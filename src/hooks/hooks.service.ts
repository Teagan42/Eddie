import { Injectable } from "@nestjs/common";
import type { HooksConfig } from "../config/types";
import { HookBus } from "./bus";
import {
  attachObjectHooks,
  importHookModule,
  type HookModule,
} from "./loader";

/**
 * HooksService resolves configured hook modules and wires them into the shared
 * {@link HookBus}. External modules may either register an installer function or
 * provide a map of event handlers to attach.
 */
@Injectable()
export class HooksService {
  async load(config?: HooksConfig): Promise<HookBus> {
    const bus = new HookBus();
    if (!config?.modules?.length) {
      return bus;
    }

    for (const entry of config.modules) {
      try {
        const hookModule: HookModule = await importHookModule(
          entry,
          config.directory
        );

        if (typeof hookModule === "function") {
          await hookModule(bus);
        } else if (hookModule && typeof hookModule === "object") {
          attachObjectHooks(bus, hookModule as Record<string, unknown>);
        }
      } catch (error) {
        console.error(`Failed to load hook module "${entry}"`, error);
      }
    }

    return bus;
  }
}

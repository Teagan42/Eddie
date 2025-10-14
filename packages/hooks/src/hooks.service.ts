import { Injectable, Logger } from "@nestjs/common";
import type { HooksConfig } from "@eddie/config";
import { HookBus } from "./hook-bus.service";
import { HookBusFactory } from "./hook-bus.factory";
import {
  HooksLoaderService,
  type HookEventHandlers,
  type HookModule,
} from "./hooks-loader.service";

/**
 * HooksService resolves configured hook modules and wires them into the shared
 * {@link HookBus}. External modules may either register an installer function or
 * provide a map of event handlers to attach.
 */
@Injectable()
export class HooksService {
  private readonly logger = new Logger(HooksService.name);

  constructor(
    private readonly hookBusFactory: HookBusFactory,
    private readonly hooksLoader: HooksLoaderService
  ) {}

  async load(config?: HooksConfig): Promise<HookBus> {
    const bus = await this.hookBusFactory.create();
    if (!config?.modules?.length) {
      return bus;
    }

    for (const entry of config.modules) {
      try {
        const hookModule: HookModule = await this.hooksLoader.importHookModule(
          entry,
          config.directory
        );

        if (typeof hookModule === "function") {
          await hookModule(bus, this.logger);
          continue;
        }

        if (hookModule && typeof hookModule === "object") {
          this.hooksLoader.attachObjectHooks(
            bus,
            hookModule as HookEventHandlers
          );
          continue;
        }

        this.logger.warn(`Hook module "${entry}" did not export a function or object`);
      } catch (error) {
        if (error instanceof Error) {
          this.logger.error(
            `Failed to load hook module "${entry}": ${error.message}`,
            error.stack
          );
        } else {
          this.logger.error(
            `Failed to load hook module "${entry}": ${String(error)}`
          );
        }
      }
    }

    return bus;
  }
}

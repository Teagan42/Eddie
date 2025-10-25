import { Injectable } from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import { ConfigService, ConfigStore } from "@eddie/config";
import type { CliRuntimeOptions } from "@eddie/config";
import type { ConfigFileFormat, ConfigFileSnapshot } from "@eddie/types";
import { RuntimeConfigService } from "../runtime-config/runtime-config.service";
import { RuntimeConfigUpdated } from "../runtime-config/events/runtime-config-updated.event";

@Injectable()
export class ConfigHotReloadService {
  constructor(
    private readonly configService: ConfigService,
    private readonly configStore: ConfigStore,
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly eventBus: EventBus
  ) {}

  async persist(source: string, format: ConfigFileFormat): Promise<ConfigFileSnapshot> {
    const runtimeOptions: CliRuntimeOptions = {};
    const snapshot = await this.configService.writeSource(
      source,
      format,
      runtimeOptions
    );
    let config = snapshot.config;

    if (!config) {
      const compositionContext = snapshot.path ? { path: snapshot.path } : {};
      config = await this.configService.compose(
        snapshot.input,
        runtimeOptions,
        compositionContext
      );
    }

    this.configStore.setSnapshot(config);
    const runtimeConfig = this.runtimeConfigService.get();
    this.eventBus.publish(new RuntimeConfigUpdated(runtimeConfig));

    return {
      ...snapshot,
      config,
    } satisfies ConfigFileSnapshot;
  }
}

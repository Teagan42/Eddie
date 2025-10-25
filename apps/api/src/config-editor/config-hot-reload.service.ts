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
    const input = this.configService.parseSource(source, format);
    const composed = await this.configService.compose(input, runtimeOptions);
    const snapshot = await this.configService.writeSource(
      source,
      format,
      runtimeOptions
    );
    this.configStore.setSnapshot(composed);
    const runtimeConfig = this.runtimeConfigService.get();
    this.eventBus.publish(new RuntimeConfigUpdated(runtimeConfig));
    return { ...snapshot, config: composed } satisfies ConfigFileSnapshot;
  }
}

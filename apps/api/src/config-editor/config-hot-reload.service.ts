import { Injectable } from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import { ConfigService, ConfigStore } from "@eddie/config";
import type { CliRuntimeOptions } from "@eddie/config";
import type { ConfigFileFormat, ConfigFileSnapshot } from "@eddie/types";
import { RuntimeConfigService } from "../runtime-config/runtime-config.service";

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
    if (snapshot.config) {
      this.configStore.setSnapshot(snapshot.config);
      return snapshot;
    }

    const compositionContext = snapshot.path ? { path: snapshot.path } : {};
    const config = await this.configService.compose(
      snapshot.input,
      runtimeOptions,
      compositionContext
    );
    this.configStore.setSnapshot(config);
    return {
      ...snapshot,
      config,
    } satisfies ConfigFileSnapshot;
  }
}

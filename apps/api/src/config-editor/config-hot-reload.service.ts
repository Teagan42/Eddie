import { Injectable } from "@nestjs/common";
import { ConfigService, ConfigStore } from "@eddie/config";
import type { CliRuntimeOptions } from "@eddie/config";
import type { ConfigFileFormat, ConfigFileSnapshot } from "@eddie/types";

@Injectable()
export class ConfigHotReloadService {
  constructor(
    private readonly configService: ConfigService,
    private readonly configStore: ConfigStore
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
    return { ...snapshot, config: composed } satisfies ConfigFileSnapshot;
  }
}

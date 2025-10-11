import { Injectable } from "@nestjs/common";
import {
  ConfigService,
  ConfigStore,
  type ConfigFileFormat,
  type ConfigFileSnapshot,
} from "@eddie/config";

@Injectable()
export class ConfigHotReloadService {
  constructor(
    private readonly configService: ConfigService,
    private readonly configStore: ConfigStore
  ) {}

  async persist(
    source: string,
    format: ConfigFileFormat,
    path?: string | null
  ): Promise<ConfigFileSnapshot> {
    const input = this.configService.parseSource(source, format);
    const composed = await this.configService.compose(input, {});
    const snapshot = await this.configService.writeSource(
      source,
      format,
      {},
      path ?? undefined
    );
    this.configStore.setSnapshot(composed);
    return { ...snapshot, config: composed } satisfies ConfigFileSnapshot;
  }
}

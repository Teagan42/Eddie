import { Inject, Injectable, Optional } from "@nestjs/common";
import { CONFIG_FILE_PATH_TOKEN, ConfigService, ConfigStore } from "@eddie/config";
import type { ConfigFileFormat, ConfigFileSnapshot } from "@eddie/types";

@Injectable()
export class ConfigHotReloadService {
  private readonly configFilePath?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly configStore: ConfigStore,
    @Optional()
    @Inject(CONFIG_FILE_PATH_TOKEN)
    configFilePath: string | null = null
  ) {
    this.configFilePath = configFilePath ?? undefined;
  }

  async persist(
    source: string,
    format: ConfigFileFormat
  ): Promise<ConfigFileSnapshot> {
    const input = this.configService.parseSource(source, format);
    const composed = await this.configService.compose(input, {});
    const targetPath = this.configFilePath;

    const snapshot = await this.configService.writeSource(
      source,
      format,
      {},
      targetPath
    );
    this.configStore.setSnapshot(composed);
    return { ...snapshot, config: composed } satisfies ConfigFileSnapshot;
  }
}

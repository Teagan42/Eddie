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
    const runtimeOptions =
      this.configFilePath !== undefined ? { config: this.configFilePath } : {};
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

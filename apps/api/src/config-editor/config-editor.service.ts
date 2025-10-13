import { BadRequestException, Injectable } from "@nestjs/common";
import {
  ConfigService,
  ConfigStore,
  EDDIE_CONFIG_SCHEMA_BUNDLE,
  type ConfigFileFormat,
  type ConfigFileSnapshot,
  type EddieConfig,
  type EddieConfigInput,
} from "@eddie/config";
import { ConfigHotReloadService } from "./config-hot-reload.service";

@Injectable()
export class ConfigEditorService {
  constructor(
    private readonly configService: ConfigService,
    private readonly hotReloadService: ConfigHotReloadService,
    private readonly configStore: ConfigStore
  ) {}

  getSchemaBundle() {
    return EDDIE_CONFIG_SCHEMA_BUNDLE;
  }

  async getSnapshot(): Promise<ConfigFileSnapshot> {
    const snapshot = await this.configService.readSnapshot();
    const config = this.configStore.getSnapshot();
    return { ...snapshot, config } satisfies ConfigFileSnapshot;
  }

  async preview(
    source: string,
    format: ConfigFileFormat
  ): Promise<{ input: EddieConfigInput; config: EddieConfig }> {
    try {
      const input = this.configService.parseSource(source, format);
      const config = await this.configService.compose(input, {});
      return { input, config };
    } catch (error) {
      throw new BadRequestException(this.normaliseError(error));
    }
  }

  async save(
    source: string,
    format: ConfigFileFormat,
    path?: string | null
  ): Promise<ConfigFileSnapshot> {
    try {
      return await this.hotReloadService.persist(source, format, path);
    } catch (error) {
      throw new BadRequestException(this.normaliseError(error));
    }
  }

  private normaliseError(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return "Unable to process configuration payload.";
  }
}

import { Global, Module, Provider } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";

import { eddieConfig } from "./config.namespace";
import { ConfigService } from "./config.service";
import { ConfigStore } from "./hot-config.store";
import { ConfigWatcher } from "./config-watcher";

const configStoreProvider: Provider = {
  provide: ConfigStore,
  useFactory: async (configService: ConfigService) => {
    const store = new ConfigStore();
    configService.bindStore(store);
    await configService.compose({});
    return store;
  },
  inject: [ConfigService],
};

@Global()
@Module({
  imports: [NestConfigModule.forFeature(eddieConfig)],
  providers: [ConfigService, configStoreProvider, ConfigWatcher],
  exports: [ConfigService, ConfigStore, ConfigWatcher, NestConfigModule],
})
export class ConfigModule {}

import { Global, Module, Provider } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";

import { ConfigService } from "./config.service";
import { ConfigStore } from "./hot-config.store";
import { eddieConfig } from "./config.namespace";

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
  providers: [ConfigService, configStoreProvider],
  exports: [ConfigService, ConfigStore, NestConfigModule],
})
export class ConfigModule {}

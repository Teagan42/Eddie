import { Module } from "@nestjs/common";
import { ProvidersModule as ProviderAdaptersModule } from "@eddie/providers";
import { ProviderCatalogService } from "./provider-catalog.service";
import { ProvidersController } from "./providers.controller";

@Module({
  imports: [ProviderAdaptersModule],
  providers: [ProviderCatalogService],
  controllers: [ProvidersController],
  exports: [ProviderCatalogService],
})
export class ProvidersModule {}

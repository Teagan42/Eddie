import { Module } from "@nestjs/common";
import { ProviderFactory } from "./provider-factory.service";

/**
 * ProvidersModule exposes the ProviderFactory so other modules can inject it
 * without depending on the providers directory structure.
 */
@Module({
  providers: [ProviderFactory],
  exports: [ProviderFactory],
})
export class ProvidersModule {}

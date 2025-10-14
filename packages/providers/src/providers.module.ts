import { Module } from "@nestjs/common";
import { AnthropicAdapterFactory } from "./anthropic";
import { OpenAIAdapterFactory } from "./openai";
import { OpenAICompatibleAdapterFactory } from "./openai_compatible";
import { ProviderFactoryService } from "./provider-factory.service";
import { PROVIDER_ADAPTER_FACTORIES } from "./provider.tokens";

const anthropicAdapterFactoryProvider = {
  provide: AnthropicAdapterFactory,
  useFactory: () => new AnthropicAdapterFactory(),
  inject: [],
} as const;

const openAIAdapterFactoryProvider = {
  provide: OpenAIAdapterFactory,
  useFactory: () => new OpenAIAdapterFactory(),
  inject: [],
} as const;

const openAICompatibleAdapterFactoryProvider = {
  provide: OpenAICompatibleAdapterFactory,
  useFactory: () => new OpenAICompatibleAdapterFactory(),
  inject: [],
} as const;

const adapterFactoryProviders = [
  anthropicAdapterFactoryProvider,
  openAIAdapterFactoryProvider,
  openAICompatibleAdapterFactoryProvider,
] as const;

/**
 * ProvidersModule exposes the ProviderFactoryService so other modules can
 * resolve provider adapters without depending on the providers directory
 * structure.
 */
@Module({
  providers: [
    ...adapterFactoryProviders,
    {
      provide: PROVIDER_ADAPTER_FACTORIES,
      useFactory: (
        anthropic: AnthropicAdapterFactory,
        openai: OpenAIAdapterFactory,
        openaiCompatible: OpenAICompatibleAdapterFactory
      ) => [anthropic, openai, openaiCompatible],
      inject: adapterFactoryProviders.map((provider) => provider.provide),
    },
    ProviderFactoryService,
  ],
  exports: [ProviderFactoryService],
})
export class ProvidersModule {}

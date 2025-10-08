import { Module } from "@nestjs/common";
import { AnthropicAdapterFactory } from "./anthropic";
import { OpenAIAdapterFactory } from "./openai";
import { OpenAICompatibleAdapterFactory } from "./openai_compatible";
import { ProviderFactoryService } from "./provider-factory.service";
import { PROVIDER_ADAPTER_FACTORIES } from "./provider.tokens";

/**
 * ProvidersModule exposes the ProviderFactoryService so other modules can
 * resolve provider adapters without depending on the providers directory
 * structure.
 */
@Module({
  providers: [
    AnthropicAdapterFactory,
    OpenAIAdapterFactory,
    OpenAICompatibleAdapterFactory,
    {
      provide: PROVIDER_ADAPTER_FACTORIES,
      useFactory: (
        anthropic: AnthropicAdapterFactory,
        openai: OpenAIAdapterFactory,
        openaiCompatible: OpenAICompatibleAdapterFactory
      ) => [anthropic, openai, openaiCompatible],
      inject: [
        AnthropicAdapterFactory,
        OpenAIAdapterFactory,
        OpenAICompatibleAdapterFactory,
      ],
    },
    ProviderFactoryService,
  ],
  exports: [ProviderFactoryService],
})
export class ProvidersModule {}

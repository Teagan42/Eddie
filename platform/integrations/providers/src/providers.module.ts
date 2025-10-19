import type { FactoryProvider } from "@nestjs/common";
import { Module } from "@nestjs/common";
import { AnthropicAdapterFactory } from "./anthropic";
import { LocalDockerModelRunnerAdapterFactory } from "./local_docker";
import { OpenAIAdapterFactory } from "./openai";
import { OpenAICompatibleAdapterFactory } from "./openai_compatible";
import { ProviderFactoryService } from "./provider-factory.service";
import { PROVIDER_ADAPTER_FACTORIES } from "./provider.tokens";

const anthropicAdapterFactoryProvider: FactoryProvider<AnthropicAdapterFactory> = {
  provide: AnthropicAdapterFactory,
  useFactory: () => new AnthropicAdapterFactory(),
  inject: [],
};

const openAIAdapterFactoryProvider: FactoryProvider<OpenAIAdapterFactory> = {
  provide: OpenAIAdapterFactory,
  useFactory: () => new OpenAIAdapterFactory(),
  inject: [],
};

const openAICompatibleAdapterFactoryProvider: FactoryProvider<OpenAICompatibleAdapterFactory> = {
  provide: OpenAICompatibleAdapterFactory,
  useFactory: () => new OpenAICompatibleAdapterFactory(),
  inject: [],
};

const localDockerAdapterFactoryProvider: FactoryProvider<LocalDockerModelRunnerAdapterFactory> = {
  provide: LocalDockerModelRunnerAdapterFactory,
  useFactory: () => new LocalDockerModelRunnerAdapterFactory(),
  inject: [],
};

export const adapterFactoryProviders: FactoryProvider[] = [
  anthropicAdapterFactoryProvider,
  openAIAdapterFactoryProvider,
  openAICompatibleAdapterFactoryProvider,
  localDockerAdapterFactoryProvider,
];

const adapterFactoryProviderTokens: FactoryProvider["provide"][] =
  adapterFactoryProviders.map((provider) => provider.provide);

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
        openaiCompatible: OpenAICompatibleAdapterFactory,
        localDocker: LocalDockerModelRunnerAdapterFactory,
      ) => [anthropic, openai, openaiCompatible, localDocker],
      inject: adapterFactoryProviderTokens,
    },
    ProviderFactoryService,
  ],
  exports: [ProviderFactoryService],
})
export class ProvidersModule {}

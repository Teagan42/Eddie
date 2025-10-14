import { Module } from "@nestjs/common";
import type { FactoryProvider } from "@nestjs/common";
import {
  TokenizerService,
  TOKENIZER_STRATEGIES,
  type TokenizerStrategyRegistry,
} from "./tokenizer.service";
import { AnthropicTokenizer, OpenAITokenizer } from "./strategies";

const openAITokenizerProvider: FactoryProvider<OpenAITokenizer> = {
  provide: OpenAITokenizer,
  useFactory: () => new OpenAITokenizer(),
  inject: [],
};

const anthropicTokenizerProvider: FactoryProvider<AnthropicTokenizer> = {
  provide: AnthropicTokenizer,
  useFactory: () => new AnthropicTokenizer(),
  inject: [],
};

export const tokenizerStrategyProviders: FactoryProvider[] = [
  openAITokenizerProvider,
  anthropicTokenizerProvider,
];

@Module({
  providers: [
    ...tokenizerStrategyProviders,
    {
      provide: TOKENIZER_STRATEGIES,
      useFactory: (
        openai: OpenAITokenizer,
        anthropic: AnthropicTokenizer
      ): TokenizerStrategyRegistry => ({
        openai,
        "openai-compatible": openai,
        anthropic,
      }),
      inject: tokenizerStrategyProviders.map((provider) => provider.provide),
    },
    TokenizerService,
  ],
  exports: [
    TokenizerService,
    ...tokenizerStrategyProviders,
    TOKENIZER_STRATEGIES,
  ],
})
export class TokenizersModule {}

import { Module } from "@nestjs/common";
import {
  TokenizerService,
  TOKENIZER_STRATEGIES,
  type TokenizerStrategyRegistry,
} from "./tokenizer.service";
import { AnthropicTokenizer, OpenAITokenizer } from "./strategies";

const openAITokenizerProvider = {
  provide: OpenAITokenizer,
  useFactory: () => new OpenAITokenizer(),
  inject: [],
} as const;

const anthropicTokenizerProvider = {
  provide: AnthropicTokenizer,
  useFactory: () => new AnthropicTokenizer(),
  inject: [],
} as const;

const tokenizerStrategyProviders = [
  openAITokenizerProvider,
  anthropicTokenizerProvider,
] as const;

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

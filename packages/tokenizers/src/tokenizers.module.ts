import { Module } from "@nestjs/common";
import {
  TokenizerService,
  TOKENIZER_STRATEGIES,
  type TokenizerStrategyRegistry,
} from "./tokenizer.service";
import { AnthropicTokenizer, OpenAITokenizer } from "./strategies";

@Module({
  providers: [
    OpenAITokenizer,
    AnthropicTokenizer,
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
      inject: [OpenAITokenizer, AnthropicTokenizer],
    },
    TokenizerService,
  ],
  exports: [
    TokenizerService,
    OpenAITokenizer,
    AnthropicTokenizer,
    TOKENIZER_STRATEGIES,
  ],
})
export class TokenizersModule {}

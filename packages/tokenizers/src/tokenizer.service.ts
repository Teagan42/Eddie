import { Inject, Injectable } from "@nestjs/common";
import type { TokenizerStrategy } from "./strategies";

export const TOKENIZER_STRATEGIES = Symbol("TOKENIZER_STRATEGIES");

export type TokenizerStrategyRegistry = Record<string, TokenizerStrategy>;

/**
 * TokenizerService provides provider-specific token counting strategies.
 */
@Injectable()
export class TokenizerService {
  constructor(
    @Inject(TOKENIZER_STRATEGIES)
    private readonly strategies: TokenizerStrategyRegistry
  ) {}

  create(provider?: string): TokenizerStrategy {
    const normalized = provider?.toLowerCase?.() ?? "openai";
    const strategy = this.strategies[normalized];
    if (strategy) {
      return strategy;
    }

    const fallback = this.strategies.openai ?? Object.values(this.strategies)[0];
    if (!fallback) {
      throw new Error("No tokenizer strategies are registered");
    }

    return fallback;
  }
}

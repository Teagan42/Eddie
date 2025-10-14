import { Inject, Injectable } from "@nestjs/common";
import type { TokenizerStrategy } from "./strategies";

export const TOKENIZER_STRATEGIES = Symbol("TOKENIZER_STRATEGIES");

export type TokenizerStrategyFactory = () => TokenizerStrategy;
export type TokenizerStrategyEntry =
  | TokenizerStrategy
  | TokenizerStrategyFactory;
export type TokenizerStrategyRegistry = Record<string, TokenizerStrategyEntry>;

/**
 * TokenizerService provides provider-specific token counting strategies.
 */
@Injectable()
export class TokenizerService {
  private readonly memoized = new Map<string, TokenizerStrategy>();

  constructor(
    @Inject(TOKENIZER_STRATEGIES)
    private readonly strategies: TokenizerStrategyRegistry
  ) {}

  create(provider?: string): TokenizerStrategy {
    const normalized = provider?.toLowerCase?.() ?? "openai";
    const directMatch = this.strategies[normalized];
    if (directMatch) {
      return this.resolve(normalized, directMatch);
    }

    const fallbackKey =
      "openai" in this.strategies
        ? "openai"
        : Object.keys(this.strategies)[0];

    if (!fallbackKey) {
      throw new Error("No tokenizer strategies are registered");
    }

    const fallback = this.strategies[fallbackKey];
    if (!fallback) {
      throw new Error("No tokenizer strategies are registered");
    }

    const resolved = this.resolve(fallbackKey, fallback);
    if (normalized !== fallbackKey) {
      this.memoized.set(normalized, resolved);
    }

    return resolved;
  }

  private resolve(
    key: string,
    entry: TokenizerStrategyEntry
  ): TokenizerStrategy {
    const existing = this.memoized.get(key);
    if (existing) {
      return existing;
    }

    const resolved =
      typeof entry === "function"
        ? (entry as TokenizerStrategyFactory)()
        : entry;

    this.memoized.set(key, resolved);
    return resolved;
  }
}

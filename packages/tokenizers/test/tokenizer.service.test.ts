import { describe, expect, it, vi } from "vitest";

import {
  TokenizerService,
  type TokenizerStrategyFactory,
  type TokenizerStrategyRegistry,
} from "../src/tokenizer.service";

describe("TokenizerService", () => {
  it("memoizes strategies returned by factories per provider", () => {
    const factory = vi.fn<TokenizerStrategyFactory>(() => ({
      countTokens: vi.fn().mockReturnValue(13),
    }));

    const strategies: TokenizerStrategyRegistry = {
      openai: factory,
    };

    const service = new TokenizerService(strategies);

    const first = service.create("openai");
    const second = service.create("openai");

    expect(typeof first.countTokens).toBe("function");
    expect(second).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

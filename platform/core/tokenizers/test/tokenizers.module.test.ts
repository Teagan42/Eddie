import type { FactoryProvider } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import {
  TokenizersModule,
  tokenizerStrategyProviders,
} from "../src/tokenizers.module";
import { OpenAITokenizer, AnthropicTokenizer } from "../src/strategies";
import { expectTypeOf } from "vitest";

describe("TokenizersModule", () => {
  const providers: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.PROVIDERS, TokenizersModule) ?? [];

  const providerFor = (token: unknown) =>
    providers.find((candidate) =>
      typeof candidate === "object" && candidate
        ? (candidate as { provide?: unknown }).provide === token
        : false
    );

  it("provides OpenAITokenizer via factory", () => {
    const provider = providerFor(OpenAITokenizer);
    expect(provider).toBeDefined();
    expect((provider as { useFactory?: unknown }).useFactory).toEqual(
      expect.any(Function)
    );
    expect((provider as { inject?: unknown[] }).inject).toEqual([]);
  });

  it("provides AnthropicTokenizer via factory", () => {
    const provider = providerFor(AnthropicTokenizer);
    expect(provider).toBeDefined();
    expect((provider as { useFactory?: unknown }).useFactory).toEqual(
      expect.any(Function)
    );
    expect((provider as { inject?: unknown[] }).inject).toEqual([]);
  });

  it("exposes tokenizer strategy providers for runtime checks", () => {
    expect(Array.isArray(tokenizerStrategyProviders)).toBe(true);
    for (const provider of tokenizerStrategyProviders) {
      expect(provider).toEqual(
        expect.objectContaining({
          provide: expect.any(Function),
          useFactory: expect.any(Function),
        })
      );
      expect(Array.isArray((provider as { inject?: unknown[] }).inject)).toBe(
        true
      );
    }
  });

  it("types tokenizer strategy providers as factory providers", () => {
    expectTypeOf(tokenizerStrategyProviders).toMatchTypeOf<FactoryProvider[]>();
  });
});

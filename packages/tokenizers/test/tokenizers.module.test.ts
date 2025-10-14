import { MODULE_METADATA } from "@nestjs/common/constants";
import { TokenizersModule } from "../src/tokenizers.module";
import { OpenAITokenizer, AnthropicTokenizer } from "../src/strategies";

describe("TokenizersModule", () => {
  const providers: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.PROVIDERS, TokenizersModule) ?? [];

  let exportedProviders: unknown[] | undefined;

  beforeAll(async () => {
    const moduleExports = await import("../src/tokenizers.module");
    exportedProviders = moduleExports.tokenizerStrategyProviders;
  });

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
    expect(exportedProviders).toBeDefined();
    expect(Array.isArray(exportedProviders)).toBe(true);
    for (const provider of exportedProviders ?? []) {
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
});

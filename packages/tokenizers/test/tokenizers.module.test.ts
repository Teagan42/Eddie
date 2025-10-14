import { MODULE_METADATA } from "@nestjs/common/constants";
import { TokenizersModule } from "../src/tokenizers.module";
import { OpenAITokenizer, AnthropicTokenizer } from "../src/strategies";

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
});

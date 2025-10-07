export interface TokenizerStrategy {
  countTokens(text: string): number;
}

export class OpenAITokenizer implements TokenizerStrategy {
  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

export class AnthropicTokenizer implements TokenizerStrategy {
  countTokens(text: string): number {
    return Math.ceil(text.length / 3.7);
  }
}

export function makeTokenizer(provider: string): TokenizerStrategy {
  if (provider === "anthropic") {
    return new AnthropicTokenizer();
  }
  return new OpenAITokenizer();
}


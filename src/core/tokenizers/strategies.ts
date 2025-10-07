import { Injectable, Scope } from "@nestjs/common";

export interface TokenizerStrategy {
  countTokens(text: string): number;
}

@Injectable({ scope: Scope.TRANSIENT })
export class OpenAITokenizer implements TokenizerStrategy {
  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

@Injectable({ scope: Scope.TRANSIENT })
export class AnthropicTokenizer implements TokenizerStrategy {
  countTokens(text: string): number {
    return Math.ceil(text.length / 3.7);
  }
}

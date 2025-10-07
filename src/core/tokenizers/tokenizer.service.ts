import { Injectable } from "@nestjs/common";
import {
  AnthropicTokenizer,
  OpenAITokenizer,
  type TokenizerStrategy,
} from "./strategies";

/**
 * TokenizerService provides provider-specific token counting strategies.
 */
@Injectable()
export class TokenizerService {
  create(provider: string): TokenizerStrategy {
    if (provider === "anthropic") {
      return new AnthropicTokenizer();
    }
    return new OpenAITokenizer();
  }
}

import { Injectable } from "@nestjs/common";
import type { ProviderConfig } from "../../config/types";
import type { ProviderAdapter } from "../types";
import { AnthropicAdapter } from "./anthropic";
import { OpenAIAdapter } from "./openai";
import { OpenAICompatibleAdapter } from "./openai_compatible";

/**
 * ProviderFactory creates a concrete provider adapter for the configured
 * provider name. It centralises adapter construction so dependency injection
 * consumers can request a single factory regardless of the underlying API.
 */
@Injectable()
export class ProviderFactory {
  create(config: ProviderConfig): ProviderAdapter {
    switch (config.name) {
      case "openai":
        return new OpenAIAdapter(config);
      case "anthropic":
        return new AnthropicAdapter(config);
      case "openai_compatible":
        return new OpenAICompatibleAdapter(config);
      case "noop":
        return {
          name: "noop",
          async *stream() {
            yield { type: "error", message: "No provider configured" } as const;
          },
        };
      default:
        throw new Error(`Unknown provider: ${config.name}`);
    }
  }
}

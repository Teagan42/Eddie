import { Injectable } from "@nestjs/common";
import type { ProviderAdapter } from "../types";
import { OpenAIAdapter } from "./openai";
import { AnthropicAdapter } from "./anthropic";
import { OpenAICompatibleAdapter } from "./openai_compatible";
import type { ProviderConfig } from "../../config/types";

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


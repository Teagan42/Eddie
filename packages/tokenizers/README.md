# @eddie/tokenizers

## Purpose

Provider-aware token counting utilities that pick the correct estimation strategy for
OpenAI, Anthropic, and compatible providers. The package bundles a NestJS module plus a
framework-agnostic service so other packages can reuse the selection logic.

## Installation

```bash
npm install @eddie/tokenizers
```

The module is ESM-first and exposes both dependency-injection ready providers and plain
TypeScript classes.

## API Reference

### `TokenizerService`

- `create(provider?: string)` – returns a tokenizer strategy for the requested provider.
  Providers are cached by name and fall back to OpenAI when no explicit match exists.
- `TOKENIZER_STRATEGIES` – dependency injection token supplying the `TokenizerStrategyRegistry`
  consumed by `TokenizerService` when selecting provider implementations.

### Strategies

- `OpenAITokenizer` – rough byte-based estimation tuned for GPT style models.
- `AnthropicTokenizer` – Anthropic-focused estimator that reflects Claude's denser token
  counts.
- Custom strategies can be registered by providing an object keyed by provider name (value
  can be an instance or a factory returning a `TokenizerStrategy`).

### NestJS Module

`TokenizersModule` exports the service, strategy implementations, and the registry token.
It registers OpenAI, OpenAI-compatible, and Anthropic strategies by default.

## Usage Examples

### Standalone usage

```ts
import { TokenizerService, TOKENIZER_STRATEGIES, OpenAITokenizer } from "@eddie/tokenizers";

const registry = {
  openai: new OpenAITokenizer(),
};

const service = new TokenizerService(registry);
const tokenizer = service.create("openai");

const count = tokenizer.countTokens("Hello Eddie");
```

### NestJS integration

```ts
import { Module } from "@nestjs/common";
import { TokenizersModule, TokenizerService } from "@eddie/tokenizers";

@Module({
  imports: [TokenizersModule],
})
export class AgentsModule {
  constructor(private readonly tokenizers: TokenizerService) {}

  countPrompt(prompt: string) {
    return this.tokenizers.create("anthropic").countTokens(prompt);
  }
}
```

## Testing

Run the Vitest suite to ensure strategy selection continues to match provider expectations:

```bash
npm run test --workspace @eddie/tokenizers
```

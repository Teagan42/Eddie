import type { ProviderCatalogEntry } from "../../../src/providers/provider-catalog.service";

export function providerCatalogEntriesFixture(): ProviderCatalogEntry[] {
  return [
    {
      name: "openai",
      label: "OpenAI",
      models: ["gpt-4o", "gpt-4o-mini"],
    },
    {
      name: "anthropic",
      label: "Anthropic Claude",
      models: ["claude-3", "claude-3-haiku"],
    },
  ];
}

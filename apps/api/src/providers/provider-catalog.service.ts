import { Injectable } from "@nestjs/common";
import { ProviderFactoryService } from "@eddie/providers";

interface ProviderCatalogSource {
  readonly name: string;
  readonly label: string;
}

const PROVIDER_CATALOG_SOURCES: ProviderCatalogSource[] = [
  { name: "openai", label: "OpenAI" },
  { name: "anthropic", label: "Anthropic Claude" },
  { name: "openai_compatible", label: "OpenAI Compatible" },
];

export interface ProviderCatalogEntry {
  name: string;
  label: string;
  models: string[];
}

@Injectable()
export class ProviderCatalogService {
  constructor(
    private readonly providerFactory: ProviderFactoryService,
  ) {}

  async catalog(): Promise<ProviderCatalogEntry[]> {
    const entries = await Promise.all(
      PROVIDER_CATALOG_SOURCES.map(async (source) => {
        const models = await this.providerFactory.listModels({
          name: source.name,
        });

        return {
          name: source.name,
          label: source.label,
          models,
        } satisfies ProviderCatalogEntry;
      })
    );

    return entries;
  }
}

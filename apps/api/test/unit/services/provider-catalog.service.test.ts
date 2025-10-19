import { describe, expect, it, vi } from "vitest";
import type { ProviderFactoryService } from "@eddie/providers";
import { ProviderCatalogService } from "../../../src/providers/provider-catalog.service";

function createService(listModels: ReturnType<typeof vi.fn>): ProviderCatalogService {
  const factory = {
    listModels,
  } as unknown as ProviderFactoryService;
  return new ProviderCatalogService(factory);
}

describe("ProviderCatalogService", () => {
  it("returns catalog entries with models resolved from the provider factory", async () => {
    const listModels = vi
      .fn<ProviderFactoryService["listModels"]>()
      .mockResolvedValueOnce(["gpt-4o", "gpt-4o-mini"])
      .mockResolvedValueOnce(["claude-3", "claude-3-haiku"])
      .mockResolvedValueOnce(["mixtral-8x7b"])
      .mockResolvedValueOnce(["llama-3-70b"]);
    const service = createService(listModels);

    const catalog = await service.catalog();

    expect(listModels).toHaveBeenCalledWith({ name: "openai" });
    expect(listModels).toHaveBeenCalledWith({ name: "anthropic" });
    expect(listModels).toHaveBeenCalledWith({ name: "openai_compatible" });
    expect(listModels).toHaveBeenCalledWith({ name: "local_docker" });
    expect(catalog).toEqual([
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
      {
        name: "openai_compatible",
        label: "OpenAI Compatible",
        models: ["mixtral-8x7b"],
      },
      {
        name: "local_docker",
        label: "Local Docker Runner",
        models: ["llama-3-70b"],
      },
    ]);
  });
});

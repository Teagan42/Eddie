import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { ProvidersController } from "../../../src/providers/providers.controller";
import { ProviderCatalogService } from "../../../src/providers/provider-catalog.service";
import { providerCatalogEntriesFixture } from "../fixtures/provider-catalog.fixture";

async function createController(catalog = vi.fn()) {
  const service = {
    catalog,
  } satisfies Pick<ProviderCatalogService, "catalog">;

  const moduleRef = await Test.createTestingModule({
    providers: [
      ProvidersController,
      {
        provide: ProviderCatalogService,
        useValue: service,
      },
    ],
  }).compile();

  const controller = moduleRef.get(ProvidersController);
  Object.assign(controller as Record<string, unknown>, { catalog: service });

  return { moduleRef, controller, service };
}

describe("ProvidersController", () => {
  it("lists provider catalog entries using DTO shape", async () => {
    const entries = providerCatalogEntriesFixture();
    const catalog = vi.fn().mockResolvedValue(entries);
    const { moduleRef, controller, service } = await createController(catalog);

    const result = await controller.listCatalog();

    expect(service.catalog).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      entries.map(({ name, label, models }) => ({ name, label, models }))
    );
    await moduleRef.close();
  });

  it("propagates catalog errors from the service", async () => {
    const error = new Error("catalog failed");
    const catalog = vi.fn().mockRejectedValue(error);
    const { moduleRef, controller } = await createController(catalog);

    await expect(controller.listCatalog()).rejects.toBe(error);
    await moduleRef.close();
  });
});

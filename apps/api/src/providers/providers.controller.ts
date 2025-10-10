import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ProviderCatalogEntryDto } from "./dto/provider-catalog-entry.dto";
import { ProviderCatalogService } from "./provider-catalog.service";

@ApiTags("Providers")
@Controller("providers")
export class ProvidersController {
  constructor(private readonly catalog: ProviderCatalogService) {}

  @Get("catalog")
  @ApiOperation({ summary: "List supported providers and available models." })
  @ApiOkResponse({ type: ProviderCatalogEntryDto, isArray: true })
  async listCatalog(): Promise<ProviderCatalogEntryDto[]> {
    const entries = await this.catalog.catalog();
    return entries.map((entry) => ({
      name: entry.name,
      label: entry.label,
      models: entry.models,
    }));
  }
}

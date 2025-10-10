import { ApiProperty } from "@nestjs/swagger";

export class ProviderCatalogEntryDto {
    @ApiProperty({ description: "Provider identifier", example: "openai" })
      name!: string;

    @ApiProperty({
      description: "Human-friendly provider label",
      example: "OpenAI",
      required: false,
      nullable: true,
    })
      label?: string;

    @ApiProperty({
      description: "Models available for the provider",
      type: [String],
      example: ["gpt-4o", "gpt-4o-mini"],
    })
      models!: string[];
}

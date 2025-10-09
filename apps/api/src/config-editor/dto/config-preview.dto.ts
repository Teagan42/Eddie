import { ApiProperty } from "@nestjs/swagger";
import type { EddieConfig, EddieConfigInput } from "@eddie/config";

export class ConfigPreviewDto {
  @ApiProperty({
    description: "Parsed configuration input object.",
    type: "object",
    additionalProperties: true,
  })
  input!: EddieConfigInput;

  @ApiProperty({
    description: "Resolved Eddie configuration.",
    type: "object",
    additionalProperties: true,
  })
  config!: EddieConfig;
}

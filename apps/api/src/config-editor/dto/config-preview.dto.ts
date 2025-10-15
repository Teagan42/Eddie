import { ApiProperty } from "@nestjs/swagger";
import type { ConfigPreviewPayload, EddieConfig, EddieConfigInput } from "@eddie/types";

export class ConfigPreviewDto implements ConfigPreviewPayload {
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

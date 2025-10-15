import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type {
  ConfigSourcePayload,
  EddieConfig,
  EddieConfigInput,
} from "@eddie/types";

export class ConfigSourceDto implements ConfigSourcePayload {
  @ApiProperty({
    description: "Absolute path to the configuration file when available.",
    nullable: true,
  })
    path!: string | null;

  @ApiProperty({
    description: "Format used for the configuration file.",
    enum: ["yaml", "json"],
  })
    format!: ConfigSourcePayload["format"];

  @ApiProperty({ description: "Raw configuration source." })
    content!: string;

  @ApiProperty({
    description: "Parsed configuration input object.",
    type: "object",
    additionalProperties: true,
  })
    input!: EddieConfigInput;

  @ApiPropertyOptional({
    description: "Resolved Eddie configuration.",
    type: "object",
    additionalProperties: true,
    nullable: true,
  })
    config!: EddieConfig | null;

  @ApiPropertyOptional({
    description:
      "Configuration validation error when the source cannot be composed.",
    nullable: true,
  })
    error!: string | null;
}

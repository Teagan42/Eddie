import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";
import type { ConfigFileFormat } from "@eddie/config";

const CONFIG_FORMATS: ConfigFileFormat[] = ["yaml", "json"];

export class ConfigSourcePayloadDto {
  @ApiProperty({ description: "Configuration source contents." })
  @IsString()
    content!: string;

  @ApiProperty({ description: "Format of the configuration payload.", enum: CONFIG_FORMATS })
  @IsString()
  @IsIn(CONFIG_FORMATS)
    format!: ConfigFileFormat;

  @ApiProperty({
    description: "Optional explicit path override when persisting the configuration.",
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
    path?: string | null;
}

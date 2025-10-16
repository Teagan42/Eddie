import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsString } from "class-validator";
import type { ConfigSourceRequestPayload } from "@eddie/types";

const CONFIG_FORMATS: ConfigSourceRequestPayload["format"][] = ["yaml", "json"];

export class ConfigSourcePayloadDto implements ConfigSourceRequestPayload {
  @ApiProperty({ description: "Configuration source contents." })
  @IsString()
    content!: string;

  @ApiProperty({ description: "Format of the configuration payload.", enum: CONFIG_FORMATS })
  @IsString()
  @IsIn(CONFIG_FORMATS)
    format!: ConfigSourceRequestPayload["format"];

}

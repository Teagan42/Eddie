import { ApiProperty } from "@nestjs/swagger";
import type {
  ConfigFileFormat,
  EddieConfig,
  EddieConfigInput,
} from "@eddie/config";

export class ConfigSourceDto {
  @ApiProperty({
    description: "Absolute path to the configuration file when available.",
    nullable: true,
  })
  path!: string | null;

  @ApiProperty({
    description: "Format used for the configuration file.",
    enum: ["yaml", "json"],
  })
  format!: ConfigFileFormat;

  @ApiProperty({ description: "Raw configuration source." })
  content!: string;

  @ApiProperty({ description: "Parsed configuration input object.", type: "object" })
  input!: EddieConfigInput;

  @ApiProperty({ description: "Resolved Eddie configuration.", type: "object" })
  config!: EddieConfig;
}

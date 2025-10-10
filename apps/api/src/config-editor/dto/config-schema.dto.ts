import { ApiProperty } from "@nestjs/swagger";
import type { JSONSchema7 } from "json-schema";

export class ConfigSchemaDto {
  @ApiProperty({ description: "Identifier for the schema bundle." })
    id!: string;

  @ApiProperty({ description: "Semantic version of the schema bundle." })
    version!: string;

  @ApiProperty({
    description: "JSON Schema describing the resolved Eddie configuration.",
    type: "object",
    additionalProperties: true,
  })
    schema!: JSONSchema7;

  @ApiProperty({
    description: "JSON Schema describing the configuration file input.",
    type: "object",
    additionalProperties: true,
  })
    inputSchema!: JSONSchema7;
}

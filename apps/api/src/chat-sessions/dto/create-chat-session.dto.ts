import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateChatSessionDto {
  @ApiProperty({ description: "Human friendly session title" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
    title!: string;

  @ApiProperty({
    description: "Optional description rendered in dashboards",
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(280)
    description?: string;
}

import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateChatSessionDto {
  @ApiPropertyOptional({ description: "Updated session title" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
    title?: string;

  @ApiPropertyOptional({ description: "Updated session description" })
  @IsOptional()
  @IsString()
  @MaxLength(280)
    description?: string | null;
}

import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class UpdateChatSessionDto {
  @ApiProperty({ description: "Updated session title" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
    title!: string;
}

import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsString, MaxLength } from "class-validator";

export enum ChatMessageRole {
  User = "user",
  Assistant = "assistant",
  System = "system",
  Tool = "tool",
}

export class CreateChatMessageDto {
  @ApiProperty({ enum: ChatMessageRole, default: ChatMessageRole.User })
  @IsEnum(ChatMessageRole)
  role: ChatMessageRole = ChatMessageRole.User;

  @ApiProperty({ description: "Content of the chat message" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content!: string;
}

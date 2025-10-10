import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ChatMessageRole } from "./create-chat-message.dto";

export class ChatSessionDto {
  @ApiProperty({ description: "Unique identifier" })
    id!: string;

  @ApiProperty({ description: "Human friendly title" })
    title!: string;

  @ApiProperty({ description: "Optional description", required: false })
    description?: string;

  @ApiProperty({ enum: ["active", "archived"], description: "Session status" })
    status!: "active" | "archived";

  @ApiProperty({ description: "Creation timestamp (ISO string)" })
    createdAt!: string;

  @ApiProperty({ description: "Last update timestamp (ISO string)" })
    updatedAt!: string;
}

export class ChatMessageDto {
  @ApiProperty({ description: "Unique identifier" })
    id!: string;

  @ApiProperty({ description: "Owning session id" })
    sessionId!: string;

  @ApiProperty({ enum: ChatMessageRole, description: "Message role" })
    role!: ChatMessageRole;

  @ApiProperty({ description: "Message content" })
    content!: string;

  @ApiProperty({ description: "Creation timestamp (ISO string)" })
    createdAt!: string;

  @ApiPropertyOptional({ description: "Identifier of the originating tool call" })
    toolCallId?: string;

  @ApiPropertyOptional({ description: "Originating tool name" })
    name?: string;
}

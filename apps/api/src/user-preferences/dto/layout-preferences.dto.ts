import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsISO8601, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class SessionLayoutSettingsDto {
  @ApiPropertyOptional({ description: "Preferred provider identifier" })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  provider?: string;

  @ApiPropertyOptional({ description: "Preferred model identifier" })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  model?: string;
}

export class ChatSessionTemplateDto {
  @ApiProperty({ description: "Template identifier" })
  @IsString()
  @MaxLength(64)
  id!: string;

  @ApiProperty({ description: "Display name" })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ description: "Provider name" })
  @IsString()
  @MaxLength(120)
  provider!: string;

  @ApiProperty({ description: "Model identifier" })
  @IsString()
  @MaxLength(120)
  model!: string;

  @ApiProperty({ description: "Prompt or command payload" })
  @IsString()
  @MaxLength(4000)
  prompt!: string;

  @ApiProperty({ description: "Template creation timestamp" })
  @IsISO8601()
  createdAt!: string;
}

export class ChatLayoutPreferencesDto {
  @ApiPropertyOptional({ description: "Currently active session identifier" })
  @IsString()
  @IsOptional()
  selectedSessionId?: string;

  @ApiPropertyOptional({
    description: "Collapsible panel state map",
    additionalProperties: { type: "boolean" },
  })
  @IsObject()
  @IsOptional()
  collapsedPanels?: Record<string, boolean>;

  @ApiPropertyOptional({ description: "Per-session runtime preferences" })
  @IsObject()
  @IsOptional()
  sessionSettings?: Record<string, SessionLayoutSettingsDto>;

  @ApiPropertyOptional({ description: "Saved chat templates" })
  @IsObject()
  @IsOptional()
  templates?: Record<string, ChatSessionTemplateDto>;
}

export class LayoutPreferencesDto {
  @ApiPropertyOptional({ type: () => ChatLayoutPreferencesDto })
  @IsOptional()
  chat?: ChatLayoutPreferencesDto;

  @ApiPropertyOptional({ description: "Last updated timestamp" })
  @IsISO8601()
  @IsOptional()
  updatedAt?: string;
}

export class UpdateLayoutPreferencesDto extends LayoutPreferencesDto {}

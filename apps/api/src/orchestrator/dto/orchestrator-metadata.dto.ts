import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsEnum, IsNumber, IsObject, IsOptional, IsString } from "class-validator";

export enum ToolCallStatusDto {
  Pending = "pending",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
}

export class ContextBundleDto {
  @ApiProperty({ description: "Context identifier" })
  @IsString()
    id!: string;

  @ApiProperty({ description: "Context label" })
  @IsString()
    label!: string;

  @ApiPropertyOptional({ description: "Summary of included assets" })
  @IsString()
  @IsOptional()
    summary?: string;

  @ApiProperty({ description: "Total size in bytes" })
  @IsNumber()
    sizeBytes!: number;

  @ApiProperty({ description: "Number of files included" })
  @IsNumber()
    fileCount!: number;
}

export class ToolCallNodeDto {
  @ApiProperty({ description: "Tool invocation identifier" })
  @IsString()
    id!: string;

  @ApiProperty({ description: "Tool name" })
  @IsString()
    name!: string;

  @ApiProperty({ enum: ToolCallStatusDto })
  @IsEnum(ToolCallStatusDto)
    status!: ToolCallStatusDto;

  @ApiPropertyOptional({ description: "Structured metadata" })
  @IsObject()
  @IsOptional()
    metadata?: Record<string, unknown>;

  @ApiProperty({ type: () => [ToolCallNodeDto] })
  @IsArray()
    children: ToolCallNodeDto[] = [];
}

export class AgentHierarchyNodeDto {
  @ApiProperty({ description: "Agent identifier" })
  @IsString()
    id!: string;

  @ApiProperty({ description: "Display name" })
  @IsString()
    name!: string;

  @ApiPropertyOptional({ description: "Associated provider" })
  @IsString()
  @IsOptional()
    provider?: string;

  @ApiPropertyOptional({ description: "Model identifier" })
  @IsString()
  @IsOptional()
    model?: string;

  @ApiPropertyOptional({ description: "Depth within the hierarchy" })
  @IsNumber()
  @IsOptional()
    depth?: number;

  @ApiPropertyOptional({ description: "Additional metadata" })
  @IsObject()
  @IsOptional()
    metadata?: Record<string, unknown>;

  @ApiProperty({ type: () => [AgentHierarchyNodeDto] })
  @IsArray()
    children: AgentHierarchyNodeDto[] = [];
}

export class OrchestratorMetadataDto {
  @ApiProperty({ type: () => [ContextBundleDto] })
  @IsArray()
    contextBundles: ContextBundleDto[] = [];

  @ApiProperty({ type: () => [ToolCallNodeDto] })
  @IsArray()
    toolInvocations: ToolCallNodeDto[] = [];

  @ApiProperty({ type: () => [AgentHierarchyNodeDto] })
  @IsArray()
    agentHierarchy: AgentHierarchyNodeDto[] = [];

  @ApiPropertyOptional({ description: "Associated session identifier" })
  @IsString()
  @IsOptional()
    sessionId?: string;

  @ApiPropertyOptional({ description: "Timestamp for the metadata snapshot" })
  @IsString()
  @IsOptional()
    capturedAt?: string;
}

import { ApiProperty } from "@nestjs/swagger";

export class TraceDto {
  @ApiProperty({ description: "Trace identifier" })
  id!: string;

  @ApiProperty({ description: "Related chat session id", required: false })
  sessionId?: string;

  @ApiProperty({ description: "Trace name" })
  name!: string;

  @ApiProperty({ description: "Trace status", enum: ["pending", "running", "completed", "failed"] })
  status!: "pending" | "running" | "completed" | "failed";

  @ApiProperty({ description: "Duration in milliseconds", required: false })
  durationMs?: number;

  @ApiProperty({ description: "Creation timestamp" })
  createdAt!: string;

  @ApiProperty({ description: "Last update timestamp" })
  updatedAt!: string;

  @ApiProperty({ description: "Structured metadata", required: false })
  metadata?: Record<string, unknown>;
}

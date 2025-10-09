import { ApiProperty } from "@nestjs/swagger";

export class LogEntryDto {
  @ApiProperty({ description: "Log identifier" })
  id!: string;

  @ApiProperty({ description: "Log level" })
  level!: "trace" | "debug" | "info" | "warn" | "error";

  @ApiProperty({ description: "Log message" })
  message!: string;

  @ApiProperty({ description: "Structured context", required: false })
  context?: Record<string, unknown>;

  @ApiProperty({ description: "Creation timestamp" })
  createdAt!: string;
}

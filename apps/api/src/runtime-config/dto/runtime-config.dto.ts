import { ApiProperty } from "@nestjs/swagger";

export class RuntimeConfigDto {
  @ApiProperty({ description: "Public HTTP API URL" })
    apiUrl!: string;

  @ApiProperty({ description: "Public WebSocket URL" })
    websocketUrl!: string;

  @ApiProperty({ description: "Feature flags" })
    features!: Record<string, boolean>;

  @ApiProperty({ description: "Active theme", enum: ["light", "dark"] })
    theme!: "light" | "dark";
}

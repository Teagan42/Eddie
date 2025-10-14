import { MODULE_METADATA } from "@nestjs/common/constants";
import { LoggerService } from "@eddie/io";
import { MCPModule } from "../src/mcp.module";
import { McpToolSourceService } from "../src/mcp-tool-source.service";

describe("MCPModule", () => {
  it("provides McpToolSourceService via factory", () => {
    const providers: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, MCPModule) ?? [];

    const provider = providers.find((candidate) =>
      typeof candidate === "object" && candidate
        ? "provide" in (candidate as Record<string, unknown>) &&
          (candidate as { provide?: unknown }).provide ===
            McpToolSourceService
        : false
    );

    expect(provider).toBeDefined();
    expect((provider as { useFactory?: unknown }).useFactory).toEqual(
      expect.any(Function)
    );
    expect((provider as { inject?: unknown[] }).inject).toEqual([
      LoggerService,
    ]);
  });
});

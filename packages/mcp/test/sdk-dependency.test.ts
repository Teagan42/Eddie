import { describe, expect, it, expectTypeOf } from "vitest";
import packageJson from "../package.json";
import type {
  Client as SdkClient,
  ClientOptions as SdkClientOptions,
} from "@modelcontextprotocol/sdk/client";
import type {
  McpClient,
  McpClientOptions,
} from "../types";

const SDK_DEPENDENCY = "@modelcontextprotocol/sdk";
const REQUIRED_MAJOR_VERSION = 1;
const VERSION_PATTERN = new RegExp(`^\\^${REQUIRED_MAJOR_VERSION}\\.`);

describe("@eddie/mcp sdk integration", () => {
  it("declares the MCP SDK dependency pinned to major 1", () => {
    const version = packageJson.dependencies?.[SDK_DEPENDENCY];
    expect(version).toMatch(VERSION_PATTERN);
  });

  it("re-exports the MCP client types from the SDK", () => {
    expectTypeOf<McpClient>().toEqualTypeOf<SdkClient>();
    expectTypeOf<McpClientOptions>().toEqualTypeOf<SdkClientOptions>();
  });
});

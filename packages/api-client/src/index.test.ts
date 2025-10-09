import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./index";
import { OpenAPI } from "./generated/core/OpenAPI";

class MockSocket {
  public io = { opts: { extraHeaders: {} as Record<string, string> } };
  public auth: Record<string, unknown> = {};
  public connected = false;
  public on = vi.fn();
  public off = vi.fn();
  public emit = vi.fn();
  public connect = vi.fn(() => {
    this.connected = true;
  });
  public disconnect = vi.fn(() => {
    this.connected = false;
  });
}

var ioMock: ReturnType<typeof vi.fn>;

vi.mock("socket.io-client", () => {
  ioMock = vi.fn(() => new MockSocket());
  return {
    io: ioMock,
  };
});

describe("createApiClient", () => {
  beforeEach(() => {
    OpenAPI.BASE = "";
    OpenAPI.HEADERS = undefined;
    OpenAPI.TOKEN = undefined;
    ioMock?.mockClear();
  });

  it("configures OpenAPI and sockets", async () => {
    const client = createApiClient({
      baseUrl: "https://example.test/api/",
      websocketUrl: "ws://example.test/ws/",
    });

    expect(OpenAPI.BASE).toBe("https://example.test/api");
    expect(ioMock!).toHaveBeenCalledWith(
      "ws://example.test/ws/chat-sessions",
      expect.objectContaining({
        transports: ["websocket"],
        autoConnect: false,
        withCredentials: true,
      })
    );

    ioMock!.mock.results.forEach((result) => {
      const socket = result.value as MockSocket;
      expect(socket.connect).toHaveBeenCalledTimes(1);
      expect(socket.auth).toEqual({});
    });

    client.updateAuth("secret");

    const headersResolver = OpenAPI.HEADERS;
    const headers =
      typeof headersResolver === "function"
        ? await headersResolver({ method: "GET" } as never)
        : {};
    expect(headers).toHaveProperty("x-api-key", "secret");

    ioMock!.mock.results.forEach((result) => {
      const socket = result.value as MockSocket;
      expect(socket.disconnect).toHaveBeenCalledTimes(1);
      expect(socket.connect).toHaveBeenCalledTimes(2);
      expect(socket.auth).toEqual({ apiKey: "secret" });
    });

    client.dispose();
    expect(ioMock!).toHaveBeenCalledTimes(4);
    ioMock!.mock.results.forEach((result) => {
      const socket = result.value as MockSocket;
      expect(socket.disconnect).toHaveBeenCalledTimes(2);
    });
  });
});

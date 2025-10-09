import { describe, expect, it } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SendChatMessagePayloadDto } from "../../../src/chat-sessions/dto/send-chat-message.dto";

describe("SendChatMessagePayloadDto", () => {
  it("accepts a valid payload", async () => {
    const payload = plainToInstance(SendChatMessagePayloadDto, {
      sessionId: "123e4567-e89b-12d3-a456-426614174000",
      message: {
        role: "user",
        content: "Hello from websocket",
      },
    });

    const errors = await validate(payload);
    expect(errors).toHaveLength(0);
  });

  it("rejects payloads without a UUID session id", async () => {
    const payload = plainToInstance(SendChatMessagePayloadDto, {
      sessionId: "not-a-uuid",
      message: {
        role: "user",
        content: "hi",
      },
    });

    const errors = await validate(payload);
    expect(errors).not.toHaveLength(0);
  });

  it("rejects payloads with an empty message body", async () => {
    const payload = plainToInstance(SendChatMessagePayloadDto, {
      sessionId: "123e4567-e89b-12d3-a456-426614174000",
      message: {
        role: "user",
        content: "",
      },
    });

    const errors = await validate(payload);
    expect(errors).not.toHaveLength(0);
  });
});

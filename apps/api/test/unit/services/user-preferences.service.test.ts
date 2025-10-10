import { describe, expect, it } from "vitest";
import { UserPreferencesService } from "../../../src/user-preferences/user-preferences.service";

describe("UserPreferencesService", () => {
  it("keeps stored preferences isolated from returned DTO mutations", () => {
    const service = new UserPreferencesService();
    const initial = service.updatePreferences("user-123", {
      chat: {
        sessionSettings: {
          "session-1": {
            provider: "openai",
            model: "gpt-4o",
          },
        },
        templates: {
          "template-1": {
            id: "template-1",
            name: "Default",
            provider: "openai",
            model: "gpt-4o",
            prompt: "Hello world",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        },
      },
    });

    initial.chat.templates!["template-1"].name = "Mutated";
    initial.chat.sessionSettings!["session-1"].provider = "anthropic";

    const reloaded = service.getPreferences("user-123");

    expect(reloaded.chat.templates!["template-1"].name).toBe("Default");
    expect(reloaded.chat.sessionSettings!["session-1"].provider).toBe("openai");
  });
});

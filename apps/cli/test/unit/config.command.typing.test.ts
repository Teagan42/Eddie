import { describe, it, expectTypeOf, vi } from "vitest";
import { ConfigCommand, type ConfigWizardQuestions } from "../../src/cli/commands/config.command";
import type { ConfigService } from "@eddie/config";

describe("ConfigCommand typing", () => {
  it("prompts using the ConfigWizardAnswers question collection", () => {
    const configService = {
      writeSource: vi.fn(),
    } as unknown as ConfigService;

    const prompter = {
      prompt: vi.fn(),
    };

    const command = new ConfigCommand(configService, prompter);
    const questions = (
      command as unknown as { createQuestions(): ConfigWizardQuestions }
    ).createQuestions();

    expectTypeOf(questions).toEqualTypeOf<ConfigWizardQuestions>();
  });
});

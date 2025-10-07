import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { runEngine } from "../../core/engine";
import { resolveCliOptions } from "../utils";
import type { ChatMessage } from "../../core/types";

export async function chat(options: Record<string, unknown>): Promise<void> {
  const engineOptions = resolveCliOptions(options);
  const rl = readline.createInterface({ input, output });
  const history: ChatMessage[] = [];

  try {
    while (true) {
      const prompt = (await rl.question("> ")).trim();
      if (!prompt) continue;
      if (["exit", "quit", "q"].includes(prompt.toLowerCase())) {
        break;
      }

      const result = await runEngine(prompt, { ...engineOptions, history });
      const assistant = [...result.messages]
        .reverse()
        .find((message) => message.role === "assistant" && message.content.trim().length > 0);

      history.push({ role: "user", content: prompt });
      if (assistant) {
        history.push({ role: "assistant", content: assistant.content });
      }

      process.stdout.write("\n");
    }
  } finally {
    rl.close();
  }
}

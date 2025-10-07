import { runEngine } from "../../core/engine";
import { resolveCliOptions } from "../utils";

export async function ask(
  prompt: string,
  options: Record<string, unknown>
): Promise<void> {
  const engineOptions = resolveCliOptions(options);
  await runEngine(prompt, engineOptions);
}


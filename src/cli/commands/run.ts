import { runEngine } from "../../core/engine";
import { resolveCliOptions } from "../utils";

export async function run(
  prompt: string,
  options: Record<string, unknown>
): Promise<void> {
  const engineOptions = resolveCliOptions(options);
  await runEngine(prompt, engineOptions);
}


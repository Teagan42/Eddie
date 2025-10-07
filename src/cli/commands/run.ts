import { EngineService } from "../../core/engine";
import { createCliApplicationContext, resolveCliOptions } from "../utils";

export async function run(
  prompt: string,
  options: Record<string, unknown>
): Promise<void> {
  const engineOptions = resolveCliOptions(options);
  const app = await createCliApplicationContext();
  try {
    const engine = app.get(EngineService);
    await engine.run(prompt, engineOptions);
  } finally {
    await app.close();
  }
}


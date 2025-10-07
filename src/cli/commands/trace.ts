import fs from "fs/promises";
import path from "path";
import { ConfigService } from "../../config/loader";
import { createCliApplicationContext, resolveCliOptions } from "../utils";

export async function trace(
  options: Record<string, unknown>
): Promise<void> {
  const engineOptions = resolveCliOptions(options);
  const app = await createCliApplicationContext();
  const configService = app.get(ConfigService);
  const cfg = await configService.load(engineOptions);

  const tracePath =
    engineOptions.jsonlTrace ??
    cfg.output?.jsonlTrace ??
    ".eddie/trace.jsonl";

  try {
    const absolute = path.resolve(tracePath);
    const data = await fs.readFile(absolute, "utf-8");
    const lines = data
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-50);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        console.log(JSON.stringify(parsed, null, 2));
      } catch {
        console.log(line);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Unable to read trace at ${tracePath}: ${message}`);
  } finally {
    await app.close();
  }
}


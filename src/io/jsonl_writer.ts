import fs from "fs/promises";
import path from "path";

async function ensureDirectory(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

export async function writeJSONL(
  filePath: string,
  event: unknown,
  append = true
): Promise<void> {
  await ensureDirectory(filePath);
  const payload = `${JSON.stringify(event)}\n`;
  if (append) {
    await fs.appendFile(filePath, payload, "utf-8");
  } else {
    await fs.writeFile(filePath, payload, "utf-8");
  }
}


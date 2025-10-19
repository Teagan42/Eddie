import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export function demoFixturePath(name: string): string {
  return resolve(__dirname, "..", "demo", "fixtures", name);
}

export async function readDemoFixture<T>(name: string): Promise<T> {
  const filePath = demoFixturePath(name);

  let contents: string;
  try {
    contents = await readFile(filePath, "utf-8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to read demo fixture "${name}" at ${filePath}: ${reason}`,
      { cause: error instanceof Error ? error : undefined },
    );
  }

  try {
    return JSON.parse(contents) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse demo fixture "${name}" at ${filePath}: ${reason}`,
      { cause: error instanceof Error ? error : undefined },
    );
  }
}

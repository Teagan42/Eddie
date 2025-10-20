import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function readCss(relativePath: string, metaUrl: string): string {
  const cssPath = resolve(dirname(fileURLToPath(metaUrl)), relativePath);
  return readFileSync(cssPath, "utf8");
}

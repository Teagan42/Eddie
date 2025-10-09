import path from "path";

export function ensureDefaultConfigRoot(): string {
  const existing = process.env.CONFIG_ROOT?.trim();

  if (existing && existing.length > 0) {
    process.env.CONFIG_ROOT = existing;
    return existing;
  }

  const defaultRoot = path.join(process.cwd(), "config");
  process.env.CONFIG_ROOT = defaultRoot;

  return defaultRoot;
}

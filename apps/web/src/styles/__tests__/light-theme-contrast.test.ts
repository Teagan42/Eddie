import { readCss } from "./read-css";

const themeCss = readCss("../../../../../platform/ui/src/theme/styles.css", import.meta.url);

function readToken(name: string): string {
  const start = themeCss.indexOf(name);
  if (start === -1) {
    return "";
  }

  const afterName = themeCss.indexOf(":", start);
  if (afterName === -1) {
    return "";
  }

  const afterColon = afterName + 1;
  const end = themeCss.indexOf(";", afterColon);
  if (end === -1) {
    return "";
  }

  return themeCss.slice(afterColon, end).trim();
}

const highContrastTokens = [
  ["--foreground", "215 30% 16%"],
  ["--muted-foreground", "215 19% 32%"],
  ["--hero-badge-fg", "rgba(15, 23, 42, 0.9)"],
  ["--hero-cta-foreground", "hsl(215 30% 18%)"],
] as const;

const heroGradientTokens = [
  ["--hero-surface-from", "210 36% 99%"],
  ["--hero-surface-via", "212 34% 96%"],
  ["--hero-surface-to", "214 32% 94%"],
] as const;

describe("light theme tokens", () => {
  it.each(highContrastTokens)(
    "assigns %s to a darker text value",
    (token, expectedValue) => {
      expect(readToken(token)).toBe(expectedValue);
    }
  );

  it.each(heroGradientTokens)(
    "assigns %s to a brighter hero gradient stop",
    (token, expectedValue) => {
      expect(readToken(token)).toBe(expectedValue);
    }
  );
});

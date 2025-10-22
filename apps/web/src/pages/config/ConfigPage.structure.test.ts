import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("ConfigPage structure", () => {
  it("uses Panel instead of Card wrappers", () => {
    const source = readFileSync(
      resolve(__dirname, "./ConfigPage.tsx"),
      "utf8"
    );

    expect(source).toContain("<Panel");
    expect(source).not.toContain("<Card");
  });

  it("lays out configuration studio stats with responsive flex panels", () => {
    const source = readFileSync(
      resolve(__dirname, "./ConfigPage.tsx"),
      "utf8"
    );

    expect(source).toContain(
      '<Flex direction={{ initial: "column", md: "row" }} wrap="wrap" gap="3" className="w-full max-w-xl"'
    );
    expect(source).not.toContain("className=\"grid w-full max-w-xl\"");
  });

  it("renders the source path card within the panel body, not actions", () => {
    const source = readFileSync(
      resolve(__dirname, "./ConfigPage.tsx"),
      "utf8"
    );

    const panelStart = source.indexOf('<Panel');
    expect(panelStart).toBeGreaterThanOrEqual(0);

    const titleIndex = source.indexOf('title="Configuration studio"', panelStart);
    expect(titleIndex).toBeGreaterThan(panelStart);

    const openTagEnd = source.indexOf('>', titleIndex);
    expect(openTagEnd).toBeGreaterThan(titleIndex);

    const openingTag = source.slice(panelStart, openTagEnd + 1);
    expect(openingTag.endsWith('/>')).toBe(false);

    const actionsStart = source.indexOf('actions={', panelStart);
    expect(actionsStart).toBeGreaterThan(panelStart);

    let depth = 0;
    let cursor = actionsStart + 'actions={'.length;
    for (; cursor < source.length; cursor += 1) {
      const char = source[cursor];
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        if (depth === 0) {
          break;
        }
        depth -= 1;
      }
    }

    const actionsContent = source.slice(actionsStart, cursor + 1);
    expect(actionsContent).not.toContain('Source path');

    const bodyStart = openTagEnd + 1;
    const closingIndex = source.indexOf('</Panel>', bodyStart);
    expect(closingIndex).toBeGreaterThan(bodyStart);

    const bodyContent = source.slice(bodyStart, closingIndex);
    expect(bodyContent).toContain('Source path');
  });

  it(
    "styles guardrail warnings with Callout.Text asChild wrappers to avoid paragraph list nesting",
    () => {
      const source = readFileSync(
        resolve(__dirname, "./ConfigPage.tsx"),
        "utf8"
      );

      const guardrailStart = source.indexOf(
        '{guardrailWarnings.length > 0 && !parseError ? ('
      );
      expect(guardrailStart).toBeGreaterThanOrEqual(0);

      const guardrailEnd = source.indexOf(') : null}', guardrailStart);
      expect(guardrailEnd).toBeGreaterThan(guardrailStart);

      const guardrailBlock = source.slice(guardrailStart, guardrailEnd);

      expect(guardrailBlock).toMatch(
        /<Callout\.Text asChild>\s*<Text as="span" weight="medium">\s*Guardrails\s*<\/Text>\s*<\/Callout\.Text>/
      );
      expect(guardrailBlock).toMatch(
        /guardrailWarnings\.map\(\(warning\) => \(\s*<Callout\.Text asChild key=\{warning\}>\s*<li>\s*<Text as="span">\{warning\}<\/Text>\s*<\/li>\s*<\/Callout\.Text>\s*\)\)/
      );
    }
  );
});

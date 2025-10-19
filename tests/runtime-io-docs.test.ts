import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const docPath = join(repoRoot, "platform", "runtime", "io", "README.md");
const docContent = readFileSync(docPath, "utf8");

describe("runtime io documentation", () => {
  it("summarises each exported service", () => {
    expect(docContent).toMatch(/# Runtime IO services/i);
    expect(docContent).toMatch(/LoggerService/);
    expect(docContent).toMatch(/ConfirmService/);
    expect(docContent).toMatch(/JsonlWriterService/);
    expect(docContent).toMatch(/StreamRendererService/);
  });

  it("explains logger and jsonl writer observers", () => {
    expect(docContent).toMatch(/listener/i);
    expect(docContent).toMatch(/observer/i);
    expect(docContent).toMatch(/apps\/cli/i);
    expect(docContent).toMatch(/apps\/api/i);
  });

  it("calls out secret redaction defaults and cli integration", () => {
    expect(docContent).toMatch(/redaction/i);
    expect(docContent).toMatch(/secret/i);
    expect(docContent).toMatch(/CLI integration/i);
    expect(docContent).toMatch(/patterns/i);
  });
});

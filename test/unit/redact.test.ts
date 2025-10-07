import { describe, it, expect } from "vitest";
import { redactSecrets } from "../../src/io/redact";

describe("redactSecrets", () => {
  it("replaces matching patterns with [REDACTED]", () => {
    const input = "token sk-1234567890ABCDEFGHIJKLMN";
    const pattern = [/sk-[A-Za-z0-9]{10,}/g];
    const output = redactSecrets(input, pattern);
    expect(output).toBe("token [REDACTED]");
  });

  it("leaves strings unchanged when no patterns match", () => {
    const input = "hello world";
    const output = redactSecrets(input, [/ghp_[A-Za-z0-9]{10,}/g]);
    expect(output).toBe(input);
  });
});

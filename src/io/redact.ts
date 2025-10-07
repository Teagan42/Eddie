export function redactSecrets(line: string, patterns: RegExp[]): string {
  return patterns.reduce((acc, pattern) => {
    return acc.replace(pattern, "[REDACTED]");
  }, line);
}


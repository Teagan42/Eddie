import { createInterface } from 'node:readline';

export function formatPrefix(name: string, width: number): string {
  const padded = name.padEnd(width, ' ');
  return `[${padded}]`;
}

export function pipeStream(
  stream: NodeJS.ReadableStream | null | undefined,
  writer: NodeJS.WritableStream,
  prefix: string,
): void {
  if (!stream) {
    return;
  }

  const rl = createInterface({ input: stream });
  rl.on('line', (line) => {
    writer.write(`${prefix} ${line}\n`);
  });
}

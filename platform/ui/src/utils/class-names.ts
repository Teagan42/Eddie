export function combineClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function wordCount(input: string): number {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

const RELATIVE_DATE_PATTERNS: [RegExp, string][] = [
  [/^(\d+)\s+seconds?\s+ago$/, '$1s'],
  [/^(\d+)\s+minutes?\s+ago$/, '$1m'],
  [/^(\d+)\s+hours?\s+ago$/, '$1h'],
  [/^(\d+)\s+days?\s+ago$/, '$1d'],
  [/^(\d+)\s+weeks?\s+ago$/, '$1w'],
  [/^(\d+)\s+months?\s+ago$/, '$1mo'],
  [/^(\d+)\s+years?\s+ago$/, '$1y'],
  [/^yesterday$/i, '1d'],
  [/^last week$/i, '1w'],
  [/^last month$/i, '1mo'],
  [/^last year$/i, '1y'],
];

export function shortenRelativeDate(relativeDate: string): string {
  for (const [pattern, replacement] of RELATIVE_DATE_PATTERNS) {
    if (pattern.test(relativeDate)) {
      return relativeDate.replace(pattern, replacement);
    }
  }

  return relativeDate.slice(0, 3);
}

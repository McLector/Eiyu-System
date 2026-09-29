/** First Unicode code point of each name part, capped without splitting surrogate pairs. */
export function profileInitials(name: string): string {
  return name.trim().split(/\s+/u).filter(Boolean)
    .map(part => Array.from(part)[0])
    .slice(0, 3).join('').toUpperCase();
}

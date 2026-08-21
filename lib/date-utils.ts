// UTC-consistent date helpers shared by eiyu-logic.ts and any code doing
// date-key arithmetic against `completed_on` (an ISO date string). Local-time
// methods (getDay/setDate) silently disagree with UTC date keys depending on
// the user's timezone — see eiyu-logic.ts for the bug this caused.
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function addUtcDays(date: Date, delta: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

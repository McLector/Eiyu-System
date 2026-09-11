// Calendar-key helpers shared by scheduling/history code. Canonical product
// dates come from accountDateKey; UTC Date objects below are only a stable
// representation for arithmetic on already-canonical YYYY-MM-DD values.
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The platform IANA zone, used only to initialize an account that has no persisted zone yet. */
export function deviceTimeZone(): string {
  const candidate = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!candidate) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format();
    return candidate;
  } catch {
    return 'UTC';
  }
}

/** Canonical YYYY-MM-DD for an instant in the persisted account IANA timezone. */
export function accountDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** Weekday for a calendar key, independent of the machine's own timezone. */
export function weekdayForDateKey(dateKey: string): number {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) throw new Error(`Invalid date key: ${dateKey}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (toDateKey(date) !== dateKey) throw new Error(`Invalid date key: ${dateKey}`);
  return date.getUTCDay();
}

export function addDateKeyDays(dateKey: string, delta: number): string {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) throw new Error(`Invalid date key: ${dateKey}`);
  return toDateKey(
    new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + delta))
  );
}

/** Monday key of the ISO week containing a canonical calendar key. */
export function mondayDateKey(dateKey: string): string {
  const weekday = weekdayForDateKey(dateKey);
  return addDateKeyDays(dateKey, weekday === 0 ? -6 : 1 - weekday);
}

/** A recurring habit is eligible on its start date when that date is scheduled, never before it. */
export function isRecurringHabitEligible(
  scheduledDays: number[],
  scheduleStartOn: string,
  dateKey: string
): boolean {
  return dateKey >= scheduleStartOn && scheduledDays.includes(weekdayForDateKey(dateKey));
}

function zonedStartOfDate(dateKey: string, timeZone: string): Date {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) throw new Error(`Invalid date key: ${dateKey}`);
  const utcGuess = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  let low = utcGuess - 36 * 3_600_000;
  let high = utcGuess + 36 * 3_600_000;

  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (accountDateKey(new Date(middle), timeZone) < dateKey) low = middle;
    else high = middle;
  }

  const start = new Date(high);
  if (accountDateKey(start, timeZone) !== dateKey) {
    throw new Error(`Calendar date ${dateKey} does not exist in ${timeZone}`);
  }
  return start;
}

/** Exact instants bounding a local calendar day; the duration may be 23, 24, or 25 hours. */
export function zonedDayBounds(dateKey: string, timeZone: string): { start: Date; end: Date } {
  return {
    start: zonedStartOfDate(dateKey, timeZone),
    end: zonedStartOfDate(addDateKeyDays(dateKey, 1), timeZone),
  };
}

export function millisecondsUntilNextAccountDay(date: Date, timeZone: string): number {
  return Math.max(0, zonedDayBounds(accountDateKey(date, timeZone), timeZone).end.getTime() - date.getTime());
}

function parseClockTime(time: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  const hour = Number(match?.[1]);
  const minute = Number(match?.[2]);
  if (!match || hour > 23 || minute > 59) throw new Error(`Invalid clock time: ${time}`);
  return { hour, minute };
}

function zonedClockParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(part => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

/** Convert an account-local date and wall-clock time to an absolute instant. */
export function zonedDateTimeInstant(dateKey: string, time: string, timeZone: string): Date {
  const dateMatch = DATE_KEY_PATTERN.exec(dateKey);
  if (!dateMatch) throw new Error(`Invalid date key: ${dateKey}`);
  const { hour, minute } = parseClockTime(time);
  const targetWallTime = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    hour,
    minute
  );
  let candidateTime = targetWallTime;

  // Offset iteration works for IANA zones without bundling another timezone
  // database. A DST gap has no exact instant and is rejected instead of
  // silently firing on a different product date.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = new Date(candidateTime);
    const parts = zonedClockParts(candidate, timeZone);
    const displayedWallTime = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const difference = targetWallTime - displayedWallTime;
    if (difference === 0) {
      candidate.setUTCMilliseconds(0);
      return candidate;
    }
    candidateTime += difference;
  }

  throw new Error(`Clock time ${dateKey} ${time} does not exist in ${timeZone}`);
}

/** Next future occurrence of an account weekday/time, used for reminder adapters. */
export function nextAccountWeekdayInstant(
  now: Date,
  weekday: number,
  time: string,
  timeZone: string
): Date {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new Error(`Invalid weekday: ${weekday}`);
  }
  const startKey = accountDateKey(now, timeZone);
  for (let offset = 0; offset <= 14; offset += 1) {
    const dateKey = addDateKeyDays(startKey, offset);
    if (weekdayForDateKey(dateKey) !== weekday) continue;
    try {
      const candidate = zonedDateTimeInstant(dateKey, time, timeZone);
      if (candidate.getTime() > now.getTime()) return candidate;
    } catch {
      // A DST spring-forward gap can make one local wall time nonexistent.
      // Continue to the following week's valid occurrence.
    }
  }
  throw new Error(`No future weekday ${weekday} at ${time} in ${timeZone}`);
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

/** Monday of the ISO week containing `date` (Sunday counts as the end of its week, not the start). */
export function mondayOfWeek(date: Date): Date {
  const d = startOfUtcDay(date);
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  return addUtcDays(d, diff);
}

/**
 * Short human-readable account-calendar date for display only.
 */
export function formatDisplayDate(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

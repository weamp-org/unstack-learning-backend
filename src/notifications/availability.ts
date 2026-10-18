export interface AvailabilityWindowLike {
  weekday: number;
  startTime: string;
  endTime: string;
  timezone: string;
}

export type AvailabilityOverrideKindLike = 'AVAILABLE' | 'UNAVAILABLE';

export interface AvailabilityOverrideLike {
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  kind: AvailabilityOverrideKindLike;
}

/// Local YYYY-MM-DD for `now` in `timezone`, or null for unknown zones.
export function localDateStr(now: Date, timezone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value;
    const year = get('year');
    const month = get('month');
    const day = get('day');
    if (year === undefined || month === undefined || day === undefined) {
      return null;
    }
    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
}

function partsInTimezone(
  now: Date,
  timezone: string,
): { weekday: number; hhmm: string; dateStr: string } | null {
  const dateStr = localDateStr(now, timezone);
  if (dateStr === null) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value;
    // Sun..Sat -> 0..6.
    const weekdayLabel = get('weekday');
    const weekdayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const weekday =
      weekdayLabel === undefined ? undefined : weekdayMap[weekdayLabel];
    const hour = get('hour');
    const minute = get('minute');
    if (weekday === undefined || hour === undefined || minute === undefined) {
      return null;
    }
    // hour12:false can yield "24" for midnight in some ICU versions.
    const normalizedHour = hour === '24' ? '00' : hour.padStart(2, '0');
    return {
      weekday,
      hhmm: `${normalizedHour}:${minute.padStart(2, '0')}`,
      dateStr,
    };
  } catch {
    // Unknown timezone: fail open (handled by the caller as available).
    return null;
  }
}

function covers(startTime: string, endTime: string, hhmm: string): boolean {
  return startTime <= hhmm && hhmm < endTime;
}

/// True when the teacher is reachable now. Date-specific overrides are
/// checked first — an UNAVAILABLE covering now always wins, an AVAILABLE
/// covering now beats a closed schedule — then the weekly pattern applies.
/// Unknown timezones fail open so a bad timezone never silences a teacher.
export function isAvailableNow(
  windows: AvailabilityWindowLike[],
  overrides: AvailabilityOverrideLike[] = [],
  now: Date = new Date(),
): boolean {
  for (const override of overrides) {
    const parts = partsInTimezone(now, override.timezone);
    if (parts === null) continue;
    if (
      parts.dateStr === override.date &&
      covers(override.startTime, override.endTime, parts.hhmm)
    ) {
      return override.kind === 'AVAILABLE';
    }
  }
  return windows.some((window) => {
    const parts = partsInTimezone(now, window.timezone);
    if (parts === null) return true;
    return (
      parts.weekday === window.weekday &&
      covers(window.startTime, window.endTime, parts.hhmm)
    );
  });
}

/// Cutoff for override reads: rows older than (UTC today minus one day) can
/// never match again — an override only matches while its own timezone is
/// still on its date — so they are safe to purge and safe to skip.
export function overrideCutoff(now: Date = new Date()): string {
  const dayMs = 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - dayMs).toISOString().slice(0, 10);
}

export interface AvailabilityWindowLike {
  weekday: number;
  startTime: string;
  endTime: string;
  timezone: string;
}

function partsInTimezone(
  now: Date,
  timezone: string,
): { weekday: number; hhmm: string } | null {
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
    return { weekday, hhmm: `${normalizedHour}:${minute.padStart(2, '0')}` };
  } catch {
    // Unknown timezone: fail open (handled by the caller as available).
    return null;
  }
}

/// True when any window covers `now`. Windows are HH:MM in their own
/// timezone on a fixed weekday; overnight windows are not supported.
/// Unknown timezones fail open so a bad timezone never silences a teacher.
export function isAvailableNow(
  windows: AvailabilityWindowLike[],
  now: Date = new Date(),
): boolean {
  return windows.some((window) => {
    const parts = partsInTimezone(now, window.timezone);
    if (parts === null) return true;
    return (
      parts.weekday === window.weekday &&
      window.startTime <= parts.hhmm &&
      parts.hhmm < window.endTime
    );
  });
}

import { isAvailableNow } from './availability.js';

const mondayNoonUtc = new Date('2026-10-19T12:00:00.000Z');

describe('isAvailableNow', () => {
  it('returns false with no windows', () => {
    expect(isAvailableNow([], [], mondayNoonUtc)).toBe(false);
  });

  it('matches a window covering now in its timezone', () => {
    expect(
      isAvailableNow(
        [
          {
            weekday: 1,
            startTime: '09:00',
            endTime: '17:00',
            timezone: 'Africa/Accra',
          },
        ],
        [],
        mondayNoonUtc,
      ),
    ).toBe(true);
  });

  it('rejects a window on another weekday', () => {
    expect(
      isAvailableNow(
        [
          {
            weekday: 2,
            startTime: '00:00',
            endTime: '23:59',
            timezone: 'Africa/Accra',
          },
        ],
        [],
        mondayNoonUtc,
      ),
    ).toBe(false);
  });

  it('treats the end as exclusive', () => {
    const atClose = new Date('2026-10-19T17:00:00.000Z');
    expect(
      isAvailableNow(
        [
          {
            weekday: 1,
            startTime: '09:00',
            endTime: '17:00',
            timezone: 'Africa/Accra',
          },
        ],
        [],
        atClose,
      ),
    ).toBe(false);
  });

  it('converts the weekday through the window timezone', () => {
    // Monday 12:00 UTC is Monday 08:00 in New York (EDT).
    expect(
      isAvailableNow(
        [
          {
            weekday: 1,
            startTime: '08:00',
            endTime: '09:00',
            timezone: 'America/New_York',
          },
        ],
        [],
        mondayNoonUtc,
      ),
    ).toBe(true);
  });

  it('fails open on unknown timezones so nobody is silenced', () => {
    expect(
      isAvailableNow(
        [
          {
            weekday: 5,
            startTime: '09:00',
            endTime: '17:00',
            timezone: 'Not/AZone',
          },
        ],
        [],
        mondayNoonUtc,
      ),
    ).toBe(true);
  });

  describe('overrides', () => {
    const openMonday = {
      weekday: 1,
      startTime: '09:00',
      endTime: '17:00',
      timezone: 'Africa/Accra',
    };

    it('an UNAVAILABLE override wins over an open schedule', () => {
      expect(
        isAvailableNow(
          [openMonday],
          [
            {
              date: '2026-10-19',
              startTime: '10:00',
              endTime: '14:00',
              timezone: 'Africa/Accra',
              kind: 'UNAVAILABLE',
            },
          ],
          mondayNoonUtc,
        ),
      ).toBe(false);
    });

    it('an AVAILABLE override opens a normally closed stretch', () => {
      expect(
        isAvailableNow(
          [],
          [
            {
              date: '2026-10-19',
              startTime: '10:00',
              endTime: '14:00',
              timezone: 'Africa/Accra',
              kind: 'AVAILABLE',
            },
          ],
          mondayNoonUtc,
        ),
      ).toBe(true);
    });

    it('ignores overrides for other dates', () => {
      expect(
        isAvailableNow(
          [openMonday],
          [
            {
              date: '2026-10-20',
              startTime: '00:00',
              endTime: '23:59',
              timezone: 'Africa/Accra',
              kind: 'UNAVAILABLE',
            },
          ],
          mondayNoonUtc,
        ),
      ).toBe(true);
    });

    it('matches the override date through its own timezone', () => {
      // Monday 12:00 UTC is Monday 08:00 in New York (EDT): the schedule is
      // empty, so only the converted override can open it.
      expect(
        isAvailableNow(
          [],
          [
            {
              date: '2026-10-19',
              startTime: '07:00',
              endTime: '09:00',
              timezone: 'America/New_York',
              kind: 'AVAILABLE',
            },
          ],
          mondayNoonUtc,
        ),
      ).toBe(true);
    });

    it('skips overrides with unknown timezones', () => {
      expect(
        isAvailableNow(
          [openMonday],
          [
            {
              date: '2026-10-19',
              startTime: '00:00',
              endTime: '23:59',
              timezone: 'Not/AZone',
              kind: 'UNAVAILABLE',
            },
          ],
          mondayNoonUtc,
        ),
      ).toBe(true);
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { formatNumber, formatPercent, formatDate, formatTime, formatDateTime, formatDuration } from './format';

describe('number formatting', () => {
  it('pins grouping, decimals, negatives and rounding in both languages', () => {
    expect(formatNumber('en', 19315)).toBe('19,315');
    expect(formatNumber('pt-BR', 19315)).toBe('19.315');
    expect(formatNumber('en', -1234.567, { decimals: 2 })).toBe('-1,234.57');
    expect(formatNumber('pt-BR', -1234.567, { decimals: 2 })).toBe('-1.234,57');
    expect(formatNumber('en', 1.25, { decimals: 1 })).toBe('1.3');
    expect(formatNumber('pt-BR', 1.25, { decimals: 1 })).toBe('1,3');
    expect(formatNumber('en', 1.2, { decimals: 3 })).toBe('1.200');
    expect(formatNumber('pt-BR', 1.2, { decimals: 3 })).toBe('1,200');
    expect(formatNumber('en', 1.6)).toBe('2');
    expect(formatNumber('en', -0)).toBe('0');
    expect(formatNumber('en', -0.001, { decimals: 2 })).toBe('0.00');
    expect(formatPercent('en', 0.621)).toBe('62.1%');
    expect(formatPercent('pt-BR', 0.621)).toBe('62,1%');
    expect(formatPercent('pt-BR', -0.125, 0)).toBe('-13%');
    expect(formatPercent('en', 0.99995, 2)).toBe('100.00%');
  });

  it('uses a visible fallback for nonfinite values', () => {
    for (const locale of ['en', 'pt-BR'] as const) for (const value of [NaN, Infinity, -Infinity]) {
      expect(formatNumber(locale, value)).toBe('-');
      expect(formatPercent(locale, value)).toBe('-');
    }
  });
});

describe('plant date and time formatting', () => {
  it.each([
    ['2026-01-01T09:00:00Z', '01/01/2026', '01/01/2026', '06:00', '06:00:00'],
    ['2026-01-01T01:00:00Z', '12/31/2025', '31/12/2025', '22:00', '22:00:00'],
    ['2026-01-02T02:59:59Z', '01/01/2026', '01/01/2026', '23:59', '23:59:59'],
    ['2026-01-02T03:00:00Z', '01/02/2026', '02/01/2026', '00:00', '00:00:00'],
    ['2026-01-02T23:15:30Z', '01/02/2026', '02/01/2026', '20:15', '20:15:30'],
  ])('pins local date order and 24 hour time for %s', (iso, enDate, ptDate, time, seconds) => {
    const ts = Date.parse(iso);
    for (const [locale, date] of [['en', enDate], ['pt-BR', ptDate]] as const) {
      expect(formatDate(locale, ts)).toBe(date);
      expect(formatTime(locale, ts)).toBe(time);
      expect(formatTime(locale, ts, { seconds: true })).toBe(seconds);
      expect(formatDateTime(locale, ts)).toBe(`${date} ${time}`);
    }
  });

  it('returns the fallback for invalid dates and nonfinite timestamps', () => {
    for (const ts of [NaN, Infinity, -Infinity, 9e15]) for (const locale of ['en', 'pt-BR'] as const) {
      expect(formatDate(locale, ts)).toBe('-');
      expect(formatTime(locale, ts)).toBe('-');
      expect(formatDateTime(locale, ts)).toBe('-');
    }
  });

  it('normalizes browser spaces and bidi marks', () => {
    const spy = vi.spyOn(Intl.NumberFormat.prototype, 'formatToParts').mockReturnValue([
      { type: 'literal', value: '\u200e\u061c1\u202f234\u00a0567\u2009890\u200f\u202a\u202c\u2066\u2069' },
    ]);
    try { expect(formatNumber('en', 1234567890)).toBe('1 234 567 890'); }
    finally { spy.mockRestore(); }
  });
});

describe('duration formatting', () => {
  it.each([
    [0, '0 s'], [42, '42 s'], [42.9, '42 s'], [60, '1 min 00 s'],
    [3900, '1 h 05 min'], [3959, '1 h 05 min'], [266400, '3 d 02 h'],
    [86400, '1 d 00 h'], [-1, '-'], [NaN, '-'], [Infinity, '-'],
  ])('formats %s seconds with literal units', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

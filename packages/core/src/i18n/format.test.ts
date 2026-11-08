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

it('caches Intl instances by locale and options', async () => {
  vi.resetModules();
  const number = vi.spyOn(Intl, 'NumberFormat');
  const date = vi.spyOn(Intl, 'DateTimeFormat');
  try {
    const fresh = await import('./format');
    for (let i = 0; i < 3; i++) {
      fresh.formatNumber('en', i);
      fresh.formatNumber('en', i, { decimals: 2 });
      fresh.formatNumber('pt-BR', i);
      fresh.formatDate('en', 0);
      fresh.formatTime('en', 0);
      fresh.formatTime('pt-BR', 0, { seconds: true });
    }
    expect(number).toHaveBeenCalledTimes(3);
    expect(date).toHaveBeenCalledTimes(3);
  } finally { number.mockRestore(); date.mockRestore(); }
});

it('formats caller percentages on the 0 to 100 scale', async () => {
  const { formatPercentValue } = await import('./format');
  expect(formatPercentValue('en', 62.1)).toBe('62.1%');
  expect(formatPercentValue('pt-BR', 62.1)).toBe('62,1%');
  expect(formatPercentValue('en', NaN)).toBe('-');
});


it('formats Tag precision and signed changes with literal bilingual strings', async () => {
  const { formatTagValue, formatChange } = await import('./format');
  for (const [locale, decimal, temperature, positive, negative] of [
    ['en', '1.7', '195.1', '+1.2', '-0.4'], ['pt-BR', '1,7', '195,1', '+1,2', '-0,4'],
  ] as const) {
    expect(formatTagValue(locale, 1.7, 'm/min')).toBe(decimal);
    expect(formatTagValue(locale, 195.136, '°C')).toBe(temperature);
    expect(formatTagValue(locale, 22, 'rpm')).toBe('22');
    expect(formatTagValue(locale, null, 'rpm')).toBe('-');
    expect(formatTagValue(locale, NaN, '°C')).toBe('-');
    expect(formatTagValue(locale, 1.7, 'unknown')).toBe(decimal);
    expect(formatChange(locale, 1.2, 'points')).toBe(positive);
    expect(formatChange(locale, -0.4, 'points')).toBe(negative);
    expect(formatChange(locale, 1.2, 'percent')).toBe(positive + '%');
    expect(formatChange(locale, -0.4, 'percent')).toBe(negative + '%');
    expect(formatChange(locale, 0, 'points')).toBe(locale === 'en' ? '+0.0' : '+0,0');
    expect(formatChange(locale, NaN, 'points')).toBe('-');
  }
});
it('exports the design suggestion precision table once through core', async () => {
  const { DECIMALS_BY_UNIT } = await import('../index');
  expect(DECIMALS_BY_UNIT).toEqual({
    rpm: 0, spm: 0, mm: 0, 'mm/min': 0, ms: 0, s: 0, pcs: 0, h: 0, V: 0, mbar: 0, 'm³/h': 0,
    '°C': 1, bar: 1, kN: 1, kW: 1, A: 1, 'L/min': 1, Nm: 1, 'm/min': 1, 'mm/s': 1, '%': 1,
  });
});

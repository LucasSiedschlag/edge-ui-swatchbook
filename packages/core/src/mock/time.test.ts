import { expect, it } from 'vitest';
import { DAY, spDate, spDayStart, spDayEnd } from './time';

it('converts date picker values to inclusive local day bounds in UTC-3', () => {
  expect(spDayStart('2025-12-31')).toBe(Date.UTC(2025, 11, 31, 3));
  expect(spDayEnd('2025-12-31')).toBe(Date.UTC(2026, 0, 1, 2, 59, 59, 999));
  expect(spDayEnd('2025-12-31') - spDayStart('2025-12-31')).toBe(DAY - 1);
  expect(spDate(spDayStart('2024-02-29'))).toBe('2024-02-29');
  expect(spDate(spDayStart('0099-01-01'))).toBe('0099-01-01');
});

it.each(['garbage', '', '2025-2-03', '2025-02-29', '2025-04-31', '2025-13-01', '2025-00-01', '2025-01-00', ' 2025-12-31', '2025-12-31T00:00:00Z'])(
  'rejects invalid local date %s at entry', date => {
    expect(() => spDayStart(date)).toThrow('YYYY-MM-DD');
    expect(() => spDayEnd(date)).toThrow('YYYY-MM-DD');
  });

import { expect, it } from 'vitest';
import * as core from './index';
import { generateMockDataset } from './mock/generate';
import { ledgerView } from './views/ledger';

it('exports the shared domain constants and type source arrays', () => {
  expect(core.TAKT_SECONDS).toBe(120);
  expect(core.NEVER).toBe(Infinity);
  expect(core.MAX_TREND_TAGS).toBe(4);
  expect(core.SHIFT_IDS).toEqual(['S1', 'S2', 'S3']);
  expect(core.BATCH_STATUSES).toEqual(['completed', 'aborted', 'rework']);
  const d = generateMockDataset();
  for (const shift of core.SHIFT_IDS) expect(ledgerView(d, { filters: { shifts: [shift] } }).rowCount).toBeGreaterThan(0);
  for (const status of core.BATCH_STATUSES) expect(ledgerView(d, { filters: { statuses: [status] } }).rowCount).toBeGreaterThan(0);
});
it('uses one Alarm message direction mapping', () => {
  for (const [key, expected] of [['alarm.low-value', 'low'], ['alarm.high-value', 'high'], ['alarm.motor-overload', 'high']] as const) {
    expect(core.alarmDirection({ message: { key } })).toBe(expected);
  }
});

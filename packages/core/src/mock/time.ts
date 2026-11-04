import type { ShiftId } from './types';

/** Fixed "now": 2026-01-01 06:00 in America/Sao_Paulo (UTC-3, no DST). */
export const NOW: number = Date.UTC(2026, 0, 1, 9, 0, 0);
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const HISTORY_DAYS = 90;
export const SP_OFFSET_HOURS = -3;

/** Hour of day (0-23) in America/Sao_Paulo. */
export function spHour(ts: number): number {
  return new Date(ts + SP_OFFSET_HOURS * HOUR).getUTCHours();
}

/** Local date YYYY-MM-DD in America/Sao_Paulo. */
export function spDate(ts: number): string {
  return new Date(ts + SP_OFFSET_HOURS * HOUR).toISOString().slice(0, 10);
}

/** S1 06-14, S2 14-22, S3 22-06. */
export function shiftAt(ts: number): ShiftId {
  const h = spHour(ts);
  if (h >= 6 && h < 14) return 'S1';
  if (h >= 14 && h < 22) return 'S2';
  return 'S3';
}

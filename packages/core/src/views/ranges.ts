import { assertSessionTick } from '../sim/context';
import { HOUR } from '../mock/time';
import { shiftInfo, simulatedTime } from '../sim/clock';

export type RangeId = 'last-shift' | 'last-24h' | 'last-7d' | 'last-30d';

const RANGE_HOURS: Record<RangeId, number> = { 'last-shift': 8, 'last-24h': 24, 'last-7d': 168, 'last-30d': 720 };

export interface RangeWindow {
  /** First instant of the window (included). */
  start: number;
  /** End of the window (excluded). */
  end: number;
  hours: number;
}

/**
 * Rolling Event Log windows. Screen 4 shares the short ranges and anchors its long ranges at load.
 * Last shift is the most recent COMPLETED Shift, the eight hours before the running Shift starts.
 * The rolling ranges are 24, 168 or 720 whole hour slots ending with the current hour, so the current hour counts with the
 * minutes that have really happened (nothing after now exists yet).
 */
export function rangeWindow(range: RangeId, tick: number): RangeWindow {
  assertSessionTick(tick);
  const hours = RANGE_HOURS[range];
  const end = range === 'last-shift' ? shiftInfo(tick).startsAt : Math.floor(simulatedTime(tick) / HOUR) * HOUR + HOUR;
  return { start: end - hours * HOUR, end, hours };
}

/** Screen 4 long ranges contain history only, ending at load throughout the session. */
export function performanceWindow(range: RangeId, tick: number): RangeWindow {
  assertSessionTick(tick);
  if (range === 'last-shift' || range === 'last-24h') return rangeWindow(range, tick);
  const hours = RANGE_HOURS[range];
  const end = simulatedTime(0);
  return { start: end - hours * HOUR, end, hours };
}

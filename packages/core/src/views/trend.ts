import type { MockDataset } from '../mock/types';
import { assertTick } from '../sim/context';
import type { Overlay } from '../sim/overlay';
import { tagSeries } from '../sim/series';
import type { TagStatus } from '../sim/tags';

export const TREND_WINDOWS = {
  '5m': { ticks: 300, step: 2 },
  '30m': { ticks: 1800, step: 10 },
  '2h': { ticks: 7200, step: 40 },
} as const;

export type TrendWindowId = keyof typeof TREND_WINDOWS;

export interface TrendPoint {
  tick: number;
  value: number;
  status: TagStatus;
  setpoint: number;
}

export interface TrendSeries {
  tagId: string;
  points: TrendPoint[];
}

export type TrendView = { series: TrendSeries[] } | { error: 'trend-limit' | 'unknown-tag' } | { empty: true };

/**
 * Exact point counts on a fixed grid: the aligned end is included and the window's left boundary is excluded.
 * At tick 0 the 2h grid has 180 points from -7160 through 0, spaced by 40 ticks.
 */
export function trendTicks(window: TrendWindowId, tick: number): number[] {
  assertTick(tick);
  const { ticks, step } = TREND_WINDOWS[window];
  const end = Math.floor(tick / step) * step;
  return Array.from({ length: ticks / step }, (_, i) => end - ticks + (i + 1) * step);
}

/** Every Library reads the same grid and Simulator series, preserving selection order and pre-load history. */
export function trendView(d: MockDataset, tagIds: readonly string[], window: TrendWindowId, tick: number, overlay?: Overlay): TrendView {
  if (tagIds.length > 4) return { error: 'trend-limit' };
  if (!tagIds.length) return { empty: true };
  if (tagIds.some((id) => !d.tags.some((tag) => tag.id === id))) return { error: 'unknown-tag' };
  const grid = trendTicks(window, tick);
  const from = grid[0]!;
  const to = grid[grid.length - 1]!;
  const { step } = TREND_WINDOWS[window];
  return { series: tagIds.map((tagId) => ({
    tagId,
    points: tagSeries(d, tagId, from, to, step, overlay).map(({ tick, value, status, setpoint }) => ({ tick, value, status, setpoint })),
  })) };
}

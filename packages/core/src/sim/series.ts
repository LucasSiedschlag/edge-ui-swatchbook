import type { MockDataset } from '../mock/types';
import { assertTick, contextOf } from './context';
import { assertOverlay, type Overlay } from './overlay';
import { readTag, type TagReading } from './tags';

export interface SeriesPoint extends TagReading {
  tick: number;
}

/**
 * Values of one Tag from `fromTick` to `toTick` (both included) every `step` ticks. Ticks before 0 are the time before load:
 * open Alarms hold their Tag out of limits from the moment they were raised, returned ones only until they returned, and
 * nothing else leaves its limits. Screen 5 trends use this so no Library keeps its own buffer.
 */
export function tagSeries(d: MockDataset, tagId: string, fromTick: number, toTick: number, step = 1, overlay?: Overlay): SeriesPoint[] {
  assertTick(fromTick);
  assertTick(toTick);
  assertTick(step);
  assertOverlay(overlay);
  if (step < 1) throw new Error('step must be at least 1');
  const ctx = contextOf(d);
  const tag = ctx.tagById.get(tagId);
  if (!tag) throw new Error(`unknown tag ${tagId}`);
  const out: SeriesPoint[] = [];
  for (let tick = fromTick; tick <= toTick; tick += step) out.push({ tick, ...readTag(ctx, tag, tick, overlay) });
  return out;
}

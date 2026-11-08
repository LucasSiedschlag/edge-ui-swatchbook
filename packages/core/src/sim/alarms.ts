import type { AlarmPriority, LineId, MockDataset, Tag, TextRef, Timestamp } from '../mock/types';
import { simulatedTime } from './clock';
import { assertTick, contextOf, type Direction, returnTickOf } from './context';
import { hash, noise } from './noise';
import { assertOverlay, type Overlay } from './overlay';
import { alarmedAt, canExcurse, EPOCH_TICKS, EXCURSION_TICKS, excursionOf, latchChanges, START_TICK, valueOnly } from './tags';

export interface Raise {
  /** Unique and stable: `RZ-<tick>-<tag id>-<high|low>`. The direction is part of the identity of the condition. */
  id: string;
  tick: number;
  time: Timestamp;
  tagId: string;
  machineId: string;
  lineId: LineId;
  batchId: string | null;
  direction: Direction;
  priority: AlarmPriority;
  message: TextRef;
}

export interface Return {
  tick: number;
  /** Null for a Tag condition: run spans decide which Alarm, if any, covered it. */
  alarmId: string | null;
  /** Null for a fault without a Tag. */
  tagId: string | null;
}

function priorityOf(key: number, epoch: number): AlarmPriority {
  const r = noise(key, 777 + epoch);
  return r < 0.05 ? 'critical' : r < 0.25 ? 'high' : r < 0.65 ? 'medium' : 'low';
}

/** One Alarm description for simulator transitions and admissions at the start of a run. */
export function raiseAt(d: MockDataset, tag: Tag, tick: number, direction: Direction): Raise {
  const time = simulatedTime(tick);
  return {
    id: `RZ-${tick}-${tag.id}-${direction}`, tick, time, tagId: tag.id,
    machineId: tag.machineId, lineId: tag.lineId,
    batchId: d.activeBatches.find(b => b.lineId === tag.lineId && b.start <= time && time < b.plannedEnd)?.id ?? null,
    direction, priority: priorityOf(hash(tag.id), Math.floor(tick / EPOCH_TICKS)),
    message: {
      key: direction === 'low' ? 'alarm.low-value' : tag.name === 'motor-current' ? 'alarm.motor-overload' : 'alarm.high-value',
      params: { tag: tag.name },
    },
  };
}

export interface AlarmTransition {
  tick: number;
  tagId: string;
  machineId: string;
  lineId: LineId;
  level: Direction | null;
  previous: Direction | null;
}

/**
 * Exact level changes in (fromTick, toTick], ordered by tick and Tag. A value-only Tag can only change at a hold or
 * excursion boundary. Evaluating their combined boundaries merges overlapping intervals, with the same hold precedence
 * as alarmedAt. Other Tags use its latch change list, including natural crossings near a limit.
 */
export function alarmTransitions(d: MockDataset, overlay: Overlay | undefined, fromTick: number, toTick: number): AlarmTransition[] {
  assertTick(fromTick);
  assertTick(toTick);
  assertOverlay(overlay);
  if (toTick <= fromTick) return [];
  const ctx = contextOf(d), out: AlarmTransition[] = [];
  for (const tag of ctx.tagById.values()) {
    const hb = ctx.heartbeat.get(tag.machineId) ?? Infinity;
    if (hb <= fromTick) continue;
    const end = Math.min(toTick, hb), candidates = new Set<number>();
    if (valueOnly(tag, overlay)) {
      for (const w of ctx.windows.get(tag.id) ?? []) {
        candidates.add(w.fromTick);
        candidates.add(w.toTick);
      }
      if (canExcurse(tag)) for (let epoch = Math.max(0, Math.floor(fromTick / EPOCH_TICKS)); epoch <= Math.floor(end / EPOCH_TICKS); epoch++) {
        const e = excursionOf(tag, epoch);
        if (e) { candidates.add(e.start); candidates.add(e.start + EXCURSION_TICKS); }
      }
    } else {
      // Before the latch origin the value alone decides, as in alarmedAt.
      for (let t = fromTick + 1; t <= Math.min(end, START_TICK); t++) candidates.add(t);
      for (const change of latchChanges(ctx, tag, end, overlay)) if (change.tick > fromTick && change.tick <= end) candidates.add(change.tick);
    }
    candidates.add(hb);
    let previous = alarmedAt(ctx, tag, fromTick, overlay);
    for (const tick of [...candidates].filter(t => t > fromTick && t <= toTick).sort((a, b) => a - b)) {
      const level = alarmedAt(ctx, tag, tick, overlay);
      if (level !== previous) out.push({ tick, tagId: tag.id, machineId: tag.machineId, lineId: tag.lineId, level, previous });
      previous = level;
    }
  }
  return out.sort((a, b) => a.tick - b.tick || a.tagId.localeCompare(b.tagId));
}

/** Every transition into a non-null level, including a direct change of direction. */
export function raises(d: MockDataset, fromTick: number, toTick: number, overlay?: Overlay): Raise[] {
  const ctx = contextOf(d);
  return alarmTransitions(d, overlay, fromTick, toTick)
    .filter(c => c.level !== null)
    .map(c => raiseAt(d, ctx.tagById.get(c.tagId)!, c.tick, c.level!));
}

/** Returns of Tag conditions and dataset faults in (fromTick, toTick]. A communication loss never returns. */
export function returns(d: MockDataset, fromTick: number, toTick: number, overlay?: Overlay): Return[] {
  const out: Return[] = alarmTransitions(d, overlay, fromTick, toTick)
    .filter(c => c.previous !== null)
    .map(c => ({ tick: c.tick, tagId: c.tagId, alarmId: null }));
  for (const a of d.alarms) {
    if (a.tagId !== null || (a.state !== 'active-unacknowledged' && a.state !== 'active-acknowledged') || a.message.key === 'alarm.comm-loss') continue;
    const tick = returnTickOf(a.id);
    if (tick > fromTick && tick <= toTick) out.push({ tick, alarmId: a.id, tagId: null });
  }
  return out.sort((x, y) => x.tick - y.tick || (x.tagId ?? '').localeCompare(y.tagId ?? '') || (x.alarmId ?? '').localeCompare(y.alarmId ?? ''));
}

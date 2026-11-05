import type { AlarmPriority, LineId, MockDataset, TextRef, Timestamp } from '../mock/types';
import { simulatedTime } from './clock';
import { assertTick, contextOf, type Direction, heldAt, returnTickOf } from './context';
import { hash, noise } from './noise';
import { type Overlay, setpointAt } from './overlay';
import { canExcurse, EPOCH_TICKS, EXCURSION_TICKS, excursionOf, readTag } from './tags';

export interface Raise {
  tick: number;
  time: Timestamp;
  /** The tick the Tag is back within limits. */
  returnTick: number;
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
  alarmId: string;
  tagId: string;
}

function priorityOf(key: number, epoch: number): AlarmPriority {
  const r = noise(key, 777 + epoch);
  return r < 0.05 ? 'critical' : r < 0.25 ? 'high' : r < 0.65 ? 'medium' : 'low';
}

/**
 * Tags that cross out of limits at a tick in (fromTick, toTick]. Plant State decides what to do with them.
 * Splitting a range in two gives the same list as asking for it whole.
 */
export function raises(d: MockDataset, fromTick: number, toTick: number, overlay?: Overlay): Raise[] {
  assertTick(fromTick);
  assertTick(toTick);
  const ctx = contextOf(d);
  const out: Raise[] = [];
  for (let epoch = Math.max(0, Math.floor(fromTick / EPOCH_TICKS)); epoch <= Math.floor(toTick / EPOCH_TICKS); epoch++) {
    for (const tag of d.tags) {
      if (!canExcurse(tag) || ctx.heartbeat.has(tag.machineId) || overlay?.setpoints?.has(tag.id)) continue;
      const e = excursionOf(tag, epoch);
      if (!e || e.start <= fromTick || e.start > toTick) continue;
      // A Tag already held out of limits by an Alarm cannot cross again until that ends.
      if (heldAt(ctx, tag.id, e.start) || heldAt(ctx, tag.id, e.start - 1)) continue;
      out.push({
        tick: e.start,
        time: simulatedTime(e.start),
        returnTick: e.start + EXCURSION_TICKS,
        tagId: tag.id,
        machineId: tag.machineId,
        lineId: tag.lineId,
        batchId: d.activeBatches.find((b) => b.lineId === tag.lineId)?.id ?? null,
        direction: e.direction,
        priority: priorityOf(hash(tag.id), epoch),
        message: {
          key: e.direction === 'low' ? 'alarm.low-value' : tag.name === 'motor-current' ? 'alarm.motor-overload' : 'alarm.high-value',
          params: { tag: tag.name },
        },
      });
    }
  }
  // A Tag with a Setpoint Override is followed tick by tick, because its value can cross at any moment.
  for (const tagId of overlay?.setpoints?.keys() ?? []) {
    const tag = ctx.tagById.get(tagId);
    if (!tag || !canExcurse(tag) || ctx.heartbeat.has(tag.machineId)) continue;
    const status = (t: number) => readTag(ctx, tag, t, setpointAt(overlay, tag, t)).status;
    for (let tick = fromTick + 1; tick <= toTick; tick++) {
      const now = status(tick);
      if ((now !== 'high' && now !== 'low') || status(tick - 1) !== 'normal') continue;
      let back = tick + 1;
      while (back < tick + 3600 && status(back) !== 'normal') back++;
      out.push({
        tick,
        time: simulatedTime(tick),
        returnTick: back,
        tagId: tag.id,
        machineId: tag.machineId,
        lineId: tag.lineId,
        batchId: d.activeBatches.find((b) => b.lineId === tag.lineId)?.id ?? null,
        direction: now,
        priority: priorityOf(hash(tag.id), Math.floor(tick / EPOCH_TICKS)),
        message: {
          key: now === 'low' ? 'alarm.low-value' : tag.name === 'motor-current' ? 'alarm.motor-overload' : 'alarm.high-value',
          params: { tag: tag.name },
        },
      });
    }
  }
  return out.sort((a, b) => a.tick - b.tick || (a.tagId < b.tagId ? -1 : a.tagId > b.tagId ? 1 : 0));
}

/** Alarms open at load whose Tag returns within limits at a tick in (fromTick, toTick]. */
export function returns(d: MockDataset, fromTick: number, toTick: number): Return[] {
  assertTick(fromTick);
  assertTick(toTick);
  const out: Return[] = [];
  for (const [tagId, windows] of contextOf(d).windows) {
    for (const w of windows) if (w.open && w.toTick > fromTick && w.toTick <= toTick) out.push({ tick: returnTickOf(w.alarmId), alarmId: w.alarmId, tagId });
  }
  return out.sort((a, b) => a.tick - b.tick || (a.alarmId < b.alarmId ? -1 : 1));
}

import type { AlarmPriority, LineId, MockDataset, TextRef, Timestamp } from '../mock/types';
import { simulatedTime } from './clock';
import { assertTick, contextOf, type Direction, heldAt, returnTickOf } from './context';
import { hash, noise } from './noise';
import { type Overlay, setpointAt } from './overlay';
import { alarmedAt, canExcurse, EPOCH_TICKS, excursionOf } from './tags';

export interface Raise {
  /** Unique and stable: `RZ-<tick>-<tag id>`. */
  id: string;
  tick: number;
  time: Timestamp;
  /** The first tick the Tag is out of alarm. Null for a raise caused by an override, because a later change can move it. */
  returnTick: number | null;
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
  /** Null for a fault that is not tied to a Tag. */
  tagId: string | null;
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
      const setpointFor = () => tag.setpoint;
      if (alarmedAt(ctx, tag, e.start - 1, setpointFor) !== null) continue;
      let back = e.start + 1;
      while (back < e.start + 600 && alarmedAt(ctx, tag, back, setpointFor) !== null) back++;
      out.push({
        id: `RZ-${e.start}-${tag.id}`,
        tick: e.start,
        time: simulatedTime(e.start),
        returnTick: back,
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
    const setpointFor = (t: number) => setpointAt(overlay, tag, t);
    for (let tick = Math.max(fromTick, 0) + 1; tick <= toTick; tick++) {
      if (heldAt(ctx, tag.id, tick) || heldAt(ctx, tag.id, tick - 1)) continue;
      const now = alarmedAt(ctx, tag, tick, setpointFor);
      if (now === null || alarmedAt(ctx, tag, tick - 1, setpointFor) !== null) continue;
      out.push({
        id: `RZ-${tick}-${tag.id}`,
        tick,
        time: simulatedTime(tick),
        returnTick: null,
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

/**
 * Alarms open at load that return to normal at a tick in (fromTick, toTick], each at its own tick. A comms loss is not listed,
 * because it stays until its Machine is back, and the Offline Machine never comes back.
 */
export function returns(d: MockDataset, fromTick: number, toTick: number): Return[] {
  assertTick(fromTick);
  assertTick(toTick);
  const out: Return[] = [];
  for (const a of d.alarms) {
    if ((a.state !== 'active-unacknowledged' && a.state !== 'active-acknowledged') || a.message.key === 'alarm.comm-loss') continue;
    const tick = returnTickOf(a.id);
    if (tick > fromTick && tick <= toTick) out.push({ tick, alarmId: a.id, tagId: a.tagId });
  }
  return out.sort((x, y) => x.tick - y.tick || (x.alarmId < y.alarmId ? -1 : 1));
}

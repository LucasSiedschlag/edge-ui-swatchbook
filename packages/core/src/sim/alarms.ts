import type { AlarmPriority, LineId, MockDataset, TextRef, Timestamp } from '../mock/types';
import { simulatedTime } from './clock';
import { hash, noise } from './noise';
import { canExcurse, type Direction, EPOCH_TICKS, excursionOf, FORCED_TICKS, forcedDirections } from './tags';

export interface Raise {
  tick: number;
  time: Timestamp;
  tagId: string;
  machineId: string;
  lineId: LineId;
  direction: Direction;
  priority: AlarmPriority;
  message: TextRef;
}

function priorityOf(key: number): AlarmPriority {
  const r = noise(key, 777);
  return r < 0.05 ? 'critical' : r < 0.25 ? 'high' : r < 0.65 ? 'medium' : 'low';
}

/**
 * Tags that cross out of limits at a tick in (fromTick, toTick]. Plant State decides what to do with them.
 * Splitting a range in two gives the same list as asking for it whole.
 */
export function raises(d: MockDataset, fromTick: number, toTick: number): Raise[] {
  const offline = new Set(d.machines.filter((m) => m.comms.status === 'offline').map((m) => m.id));
  const forced = forcedDirections(d.alarms);
  const out: Raise[] = [];
  for (let epoch = Math.floor(fromTick / EPOCH_TICKS); epoch <= Math.floor(toTick / EPOCH_TICKS); epoch++) {
    for (const tag of d.tags) {
      if (!canExcurse(tag) || offline.has(tag.machineId)) continue;
      const e = excursionOf(tag, epoch);
      if (!e || e.start <= fromTick || e.start > toTick) continue;
      // A Tag already held out of limits by an open Alarm cannot cross again until that ends.
      if (forced.has(tag.id) && e.start <= FORCED_TICKS) continue;
      const key = hash(tag.id);
      out.push({
        tick: e.start,
        time: simulatedTime(e.start),
        tagId: tag.id,
        machineId: tag.machineId,
        lineId: tag.lineId,
        direction: e.direction,
        priority: priorityOf(key),
        message: {
          key: e.direction === 'low' ? 'alarm.low-value' : tag.name === 'motor-current' ? 'alarm.motor-overload' : 'alarm.high-value',
          params: { tag: tag.name },
        },
      });
    }
  }
  return out.sort((a, b) => a.tick - b.tick);
}

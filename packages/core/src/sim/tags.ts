import type { Alarm, Tag } from '../mock/types';
import { hash, noise, smooth } from './noise';

export type TagStatus = 'normal' | 'high' | 'low' | 'stale';
export type Direction = 'high' | 'low';

export interface TagReading {
  tagId: string;
  value: number;
  status: TagStatus;
}

/** Counters and run hours have no high or low limit worth an Alarm. */
const COUNTER_UNITS = new Set(['pcs', 'h']);
/** Alarms open at tick 0 keep their Tag out of limits for this many ticks. */
export const FORCED_TICKS = 600;
/** An excursion is a short stretch out of limits. One chance per Tag per epoch. */
export const EPOCH_TICKS = 300;
const EXCURSION_TICKS = 30;
const EXCURSION_CHANCE = 0.004;

const round3 = (x: number) => Math.round(x * 1000) / 1000;

export function canExcurse(tag: Tag): boolean {
  return !COUNTER_UNITS.has(tag.unit);
}

/** Tags held out of limits at the start because an Alarm is open on them. */
export function forcedDirections(alarms: Alarm[]): Map<string, Direction> {
  const out = new Map<string, Direction>();
  for (const a of alarms) {
    if (a.tagId === null || (a.state !== 'active-unacknowledged' && a.state !== 'active-acknowledged')) continue;
    out.set(a.tagId, a.message.key === 'alarm.low-value' ? 'low' : 'high');
  }
  return out;
}

export interface Excursion { start: number; direction: Direction }

/** The excursion of a Tag in one epoch, if it has one. Depends on the Tag and the epoch only. */
export function excursionOf(tag: Tag, epoch: number): Excursion | null {
  if (!canExcurse(tag)) return null;
  const key = hash(tag.id);
  if (noise(key ^ 0x5bd1e995, epoch) >= EXCURSION_CHANCE) return null;
  const start = epoch * EPOCH_TICKS + 30 + Math.floor(noise(key, epoch + 10_000) * 240);
  return { start, direction: noise(key, epoch + 20_000) < 0.5 ? 'high' : 'low' };
}

function excursionAt(tag: Tag, tick: number): Direction | null {
  const e = excursionOf(tag, Math.floor(tick / EPOCH_TICKS));
  return e && tick >= e.start && tick < e.start + EXCURSION_TICKS ? e.direction : null;
}

/** Value of a Tag at a tick: its setpoint plus a slow drift and a little jitter. Depends on the Tag and the tick only. */
export function tagValue(tag: Tag, tick: number, forced?: Direction): number {
  const key = hash(tag.id);
  const range = tag.max - tag.min;
  const out = forced ?? excursionAt(tag, tick);
  if (out) {
    const over = range * (0.03 + 0.01 * noise(key, tick));
    return round3(out === 'high' ? tag.max + over : tag.min - over);
  }
  const period = 60 + Math.floor(noise(key, -1) * 540);
  const drift = (smooth(key, tick, period) - 0.5) * 2 * 0.7;
  const jitter = (noise(key, tick) - 0.5) * 2 * 0.3;
  return round3(tag.setpoint + range * 0.02 * (drift + jitter));
}

function statusOf(tag: Tag, value: number): TagStatus {
  return value > tag.max ? 'high' : value < tag.min ? 'low' : 'normal';
}

/** Tags of an Offline Machine are Stale: they stop updating and keep their first value. */
export function readTags(tags: Tag[], tick: number, offlineMachines: ReadonlySet<string>, forced: ReadonlyMap<string, Direction>): TagReading[] {
  return tags.map((t) => {
    if (offlineMachines.has(t.machineId)) return { tagId: t.id, value: tagValue(t, 0), status: 'stale' };
    const value = tagValue(t, tick, tick < FORCED_TICKS ? forced.get(t.id) : undefined);
    return { tagId: t.id, value, status: statusOf(t, value) };
  });
}

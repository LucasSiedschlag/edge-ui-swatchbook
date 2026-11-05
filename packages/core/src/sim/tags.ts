import type { Tag } from '../mock/types';
import { type Direction, heldAt, type SimContext } from './context';
import { hash, noise, smooth } from './noise';

export type TagStatus = 'normal' | 'high' | 'low' | 'stale';
export type { Direction };

export interface TagReading {
  tagId: string;
  value: number;
  /** Where the value is against the limits right now. It can flicker when a value hovers at a limit. */
  status: TagStatus;
  /** The setpoint in force at this tick, after any Setpoint Override. */
  setpoint: number;
  /**
   * Alarm state with a deadband. Set when the value goes out of limits, and cleared only once it is back inside
   * by 5 percent of the range. A value hovering at a limit therefore stays in one alarm. Plant State returns an Alarm when this is null.
   */
  alarm: Direction | null;
}

/** How far inside the limits a value must be to count as clearly back. */
const DEADBAND = 0.05;
/** How far back to look for the last tick that decided the alarm state. */
const LOOKBACK = 300;

/** Counters and run hours have no high or low limit worth an Alarm. */
const COUNTER_UNITS = new Set(['pcs', 'h']);
/** An excursion is a short stretch out of limits. One chance per Tag per epoch. */
export const EPOCH_TICKS = 300;
export const EXCURSION_TICKS = 30;
const EXCURSION_CHANCE = 0.004;

const round3 = (x: number) => Math.round(x * 1000) / 1000;

export function canExcurse(tag: Tag): boolean {
  return !COUNTER_UNITS.has(tag.unit);
}

export interface Excursion { start: number; direction: Direction }

/** The excursion of a Tag in one epoch, if it has one. Depends on the Tag and the epoch only. Nothing happens before load. */
export function excursionOf(tag: Tag, epoch: number): Excursion | null {
  if (epoch < 0 || !canExcurse(tag)) return null;
  const key = hash(tag.id);
  if (noise(key ^ 0x5bd1e995, epoch) >= EXCURSION_CHANCE) return null;
  const start = epoch * EPOCH_TICKS + 30 + Math.floor(noise(key, epoch + 10_000) * 240);
  return { start, direction: noise(key, epoch + 20_000) < 0.5 ? 'high' : 'low' };
}

function excursionAt(tag: Tag, tick: number): Direction | null {
  const e = excursionOf(tag, Math.floor(tick / EPOCH_TICKS));
  return e && tick >= e.start && tick < e.start + EXCURSION_TICKS ? e.direction : null;
}

/** Value of a Tag at a tick: its setpoint plus a slow drift and a little jitter. Depends on the Tag, the setpoint and the tick only. */
export function tagValue(tag: Tag, tick: number, held?: Direction | null, setpoint: number = tag.setpoint): number {
  const key = hash(tag.id);
  const range = tag.max - tag.min;
  const out = held ?? excursionAt(tag, tick);
  if (out) {
    const over = range * (0.03 + 0.01 * noise(key, tick));
    return round3(out === 'high' ? tag.max + over : tag.min - over);
  }
  const period = 60 + Math.floor(noise(key, -1) * 540);
  const drift = (smooth(key, tick, period) - 0.5) * 2 * 0.7;
  const jitter = (noise(key, tick) - 0.5) * 2 * 0.3;
  return round3(setpoint + range * 0.02 * (drift + jitter));
}

function statusOf(tag: Tag, value: number): TagStatus {
  return value > tag.max ? 'high' : value < tag.min ? 'low' : 'normal';
}

export type SetpointFor = (tick: number) => number;

/** Alarm state at a tick: the last tick that was clearly out or clearly inside decides. Stateless, so any range gives the same answer. */
export function alarmedAt(ctx: SimContext, tag: Tag, tick: number, setpointFor: SetpointFor): Direction | null {
  const hb = ctx.heartbeat.get(tag.machineId);
  if (hb !== undefined && tick >= hb) return null;
  const margin = (tag.max - tag.min) * DEADBAND;
  for (let t = tick; t > tick - LOOKBACK; t--) {
    const v = tagValue(tag, t, heldAt(ctx, tag.id, t), setpointFor(t));
    if (v > tag.max) return 'high';
    if (v < tag.min) return 'low';
    if (v <= tag.max - margin && v >= tag.min + margin) return null;
  }
  return null;
}

/**
 * One Tag at one tick. An open Alarm holds its Tag out of limits for its stretch. A Tag of an Offline Machine
 * is Stale from the last heartbeat on, frozen at the value it had then.
 */
export function readTag(ctx: SimContext, tag: Tag, tick: number, setpointFor: SetpointFor = () => tag.setpoint): TagReading {
  const hb = ctx.heartbeat.get(tag.machineId);
  if (hb !== undefined && tick >= hb) {
    return { tagId: tag.id, value: tagValue(tag, hb, null, setpointFor(hb)), status: 'stale', setpoint: setpointFor(hb), alarm: null };
  }
  const setpoint = setpointFor(tick);
  const value = tagValue(tag, tick, heldAt(ctx, tag.id, tick), setpoint);
  return { tagId: tag.id, value, status: statusOf(tag, value), setpoint, alarm: alarmedAt(ctx, tag, tick, setpointFor) };
}

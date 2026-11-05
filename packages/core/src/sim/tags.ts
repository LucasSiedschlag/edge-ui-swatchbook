import type { Tag } from '../mock/types';
import { type Direction, heldAt, type Latch, type SimContext } from './context';
import { type Overlay, setpointAt } from './overlay';
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

/** Alarm states are worked out forward from here. Nothing is in alarm before. */
export const START_TICK = -7500;

type Latches = Map<string, Latch>;
const overlayLatches = new WeakMap<Overlay, Latches>();

function latchesOf(ctx: SimContext, overlay: Overlay | undefined, tag: Tag): Latches {
  if (!overlay?.setpoints?.has(tag.id)) return ctx.latches;
  let m = overlayLatches.get(overlay);
  if (!m) overlayLatches.set(overlay, (m = new Map()));
  return m;
}

/** Most recent latch set wins when both are set. */
function currentAlarm(hiAt: number | null, loAt: number | null): Direction | null {
  if (hiAt !== null && loAt !== null) return hiAt > loAt ? 'high' : 'low';
  return hiAt !== null ? 'high' : loAt !== null ? 'low' : null;
}

/**
 * Alarm state at a tick, with a deadband on each side. The high side sets when the value goes above max and clears only at
 * `max - 5%` of the range or lower. The low side sets below min and clears at `min + 5%` or higher. It is worked out forward
 * and kept per Tag, so a value hovering at a limit stays in one alarm for as long as it hovers.
 *
 * A change of Overlay must be a new object, because the latch is kept per Overlay object.
 */
export function alarmedAt(ctx: SimContext, tag: Tag, tick: number, overlay?: Overlay): Direction | null {
  const hb = ctx.heartbeat.get(tag.machineId);
  if (hb !== undefined && tick >= hb) return null;
  const range = tag.max - tag.min;
  // A setpoint well inside the limits is always clearly inside again as soon as the value is back, so the value alone decides.
  const central = tag.setpoint >= tag.min + range * 0.07 && tag.setpoint <= tag.max - range * 0.07;
  if (central && !overlay?.setpoints?.has(tag.id)) {
    const v = tagValue(tag, tick, heldAt(ctx, tag.id, tick));
    return v > tag.max ? 'high' : v < tag.min ? 'low' : null;
  }
  if (tick < START_TICK) return null;
  const store = latchesOf(ctx, overlay, tag);
  let latch = store.get(tag.id);
  if (!latch) store.set(tag.id, (latch = { upTo: START_TICK - 1, hiAt: null, loAt: null, changes: [] }));
  const margin = range * DEADBAND;
  let prev = latch.changes.length > 0 ? (latch.changes[latch.changes.length - 1] as { alarm: Direction | null }).alarm : null;
  for (let t = latch.upTo + 1; t <= tick; t++) {
    const v = tagValue(tag, t, heldAt(ctx, tag.id, t), setpointAt(overlay, tag, t));
    if (v > tag.max && latch.hiAt === null) latch.hiAt = t;
    else if (v <= tag.max - margin) latch.hiAt = null;
    if (v < tag.min && latch.loAt === null) latch.loAt = t;
    else if (v >= tag.min + margin) latch.loAt = null;
    const now = currentAlarm(latch.hiAt, latch.loAt);
    if (now !== prev) {
      latch.changes.push({ tick: t, alarm: now });
      prev = now;
    }
  }
  latch.upTo = Math.max(latch.upTo, tick);
  // Last change at or before the tick.
  let lo = 0;
  let hi = latch.changes.length - 1;
  let ans: Direction | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = latch.changes[mid] as { tick: number; alarm: Direction | null };
    if (c.tick <= tick) {
      ans = c.alarm;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/**
 * One Tag at one tick. An open Alarm holds its Tag out of limits for its stretch. A Tag of an Offline Machine
 * is Stale from the last heartbeat on, frozen at the value it had then.
 */
export function readTag(ctx: SimContext, tag: Tag, tick: number, overlay?: Overlay): TagReading {
  const hb = ctx.heartbeat.get(tag.machineId);
  if (hb !== undefined && tick >= hb) {
    const sp = setpointAt(overlay, tag, hb);
    return { tagId: tag.id, value: tagValue(tag, hb, null, sp), status: 'stale', setpoint: sp, alarm: null };
  }
  const setpoint = setpointAt(overlay, tag, tick);
  const value = tagValue(tag, tick, heldAt(ctx, tag.id, tick), setpoint);
  return { tagId: tag.id, value, status: statusOf(tag, value), setpoint, alarm: alarmedAt(ctx, tag, tick, overlay) };
}

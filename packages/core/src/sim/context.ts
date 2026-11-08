import { activeRecipeParameter } from '../parameters';
import type { Alarm, MockDataset, Tag } from '../mock/types';
import { hash, noise } from './noise';

export type Direction = 'high' | 'low';

/** One mapping for seeded Alarm holds and Plant State condition history. */
export const alarmDirection = (alarm: Pick<Alarm, 'message'>): Direction => alarm.message.key === 'alarm.low-value' ? 'low' : 'high';

/** A stretch of ticks in which an Alarm from the Mock Dataset holds its Tag out of limits. */
export interface AlarmWindow {
  alarmId: string;
  fromTick: number;
  /** Exclusive. */
  toTick: number;
  direction: Direction;
}

/** The alarm state of one Tag, worked out forward from `START_TICK` and kept as a list of changes. */
export interface Latch {
  /** The last tick worked out. */
  upTo: number;
  hiAt: number | null;
  loAt: number | null;
  /** One entry each time either side sets or clears. */
  changes: { tick: number; alarm: Direction | null; hiAt: number | null; loAt: number | null }[];
  /** For a Tag with Setpoint Overrides: the steps this was worked out from. */
  steps?: { fromTick: number; value: number }[];
}

export interface SimContext {
  /** Latches of Tags that follow the dataset only and cannot be taken from the value alone. */
  latches: Map<string, Latch>;
  /** Latches of Tags with Setpoint Overrides, one per Tag, worked out from the steps of the Overlay last asked about. */
  overlayLatches: Map<string, Latch>;
  tagById: Map<string, Tag>;
  windows: Map<string, AlarmWindow[]>;
  /** Offline Machine id to the tick of its last heartbeat. */
  heartbeat: Map<string, number>;
}

const tickOf = (d: MockDataset, t: number) => Math.ceil((t - d.now) / 1000);

/** Open Alarms return to normal between 300 and 899 ticks after load, each at its own tick. */
export function returnTickOf(alarmId: string): number {
  return 300 + Math.floor(noise(hash(alarmId), 5) * 600);
}

const cache = new WeakMap<MockDataset, SimContext>();

/** What the Simulator needs from the Mock Dataset, worked out once per dataset. */
export function contextOf(d: MockDataset): SimContext {
  const known = cache.get(d);
  if (known) return known;
  const windows = new Map<string, AlarmWindow[]>();
  for (const a of d.alarms) {
    if (a.tagId === null) continue;
    const direction = alarmDirection(a);
    let w: AlarmWindow | null = null;
    if (a.state === 'active-unacknowledged' || a.state === 'active-acknowledged') {
      w = { alarmId: a.id, fromTick: tickOf(d, a.raisedAt), toTick: returnTickOf(a.id), direction };
    } else if (a.state === 'returned-unacknowledged' && a.returnedAt !== null) {
      w = { alarmId: a.id, fromTick: tickOf(d, a.raisedAt), toTick: tickOf(d, a.returnedAt), direction };
    }
    if (w) windows.set(a.tagId, [...(windows.get(a.tagId) ?? []), w]);
  }
  const heartbeat = new Map<string, number>();
  for (const m of d.machines) if (m.comms.status === 'offline') heartbeat.set(m.id, tickOf(d, m.comms.lastHeartbeatAt));
  const ctx: SimContext = { latches: new Map(), overlayLatches: new Map(), tagById: new Map(d.tags.map((t) => {
    const parameter = activeRecipeParameter(d, t);
    return [t.id, parameter ? { ...t, setpoint: parameter.setpoint } : t];
  })), windows, heartbeat };
  cache.set(d, ctx);
  return ctx;
}

/** The direction an Alarm holds this Tag at this tick, if any. */
export function heldAt(ctx: SimContext, tagId: string, tick: number): Direction | undefined {
  return ctx.windows.get(tagId)?.find((w) => tick >= w.fromTick && tick < w.toTick)?.direction;
}

/** Supported session horizon: seven days after load. Negative history ticks remain available. */
export const MAX_TICK = 7 * 86400;

export function assertTick(tick: number): void {
  if (!Number.isSafeInteger(tick) || tick > MAX_TICK) throw new Error(`tick must be a safe integer at or below ${MAX_TICK}, got ${tick}`);
}

/** Screen selectors operate after load; Tag series alone can read negative history ticks. */
export function assertSessionTick(tick: number): void {
  assertTick(tick);
  if (tick < 0) throw new Error('tick must be 0 or more');
}

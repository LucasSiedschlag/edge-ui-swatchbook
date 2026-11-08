import type { Alarm } from '../mock/types';
import { simulatedTime } from '../sim/clock';
import { alarmTransitions, raiseAt } from '../sim/alarms';
import { assertTick, contextOf, returnTickOf, type Direction } from '../sim/context';
import { alarmedAt } from '../sim/tags';
import type { Overlay } from '../sim/overlay';
import type { PlantState } from './types';

export const isActive = (a: Alarm): boolean => a.state === 'active-unacknowledged' || a.state === 'active-acknowledged';
const directionOf = (a: Alarm): Direction => a.message.key === 'alarm.low-value' ? 'low' : 'high';

function applyReturn(a: Alarm, tick: number): Alarm {
  const time = simulatedTime(tick);
  return a.state === 'active-unacknowledged' ? { ...a, state: 'returned-unacknowledged', returnedAt: time }
    : { ...a, state: 'cleared', returnedAt: time, clearedAt: time };
}

/** Acknowledges one Alarm. Repeated acknowledgements do not change it. */
export function acknowledge(a: Alarm, tick: number, userId: string): Alarm | null {
  const time = simulatedTime(tick);
  if (a.state === 'active-unacknowledged') return { ...a, state: 'active-acknowledged', acknowledgedAt: time, acknowledgedBy: userId };
  if (a.state === 'returned-unacknowledged') return { ...a, state: 'cleared', acknowledgedAt: time, acknowledgedBy: userId, clearedAt: time };
  return null;
}

interface History {
  initial: Alarm;
  returnedTick?: number;
}
interface Timeline {
  through: number;
  history: History[];
  open: Map<string, History[]>;
}
// An Overlay is immutable. Each timeline is only extended, and its records never escape the selector.
const timelines = new WeakMap<Overlay, Timeline>();
const views = new WeakMap<PlantState, { tick: number; list: readonly Alarm[] }>();

function extend(state: PlantState, tick: number): Timeline {
  let timeline = timelines.get(state.overlay);
  if (!timeline) {
    timeline = { through: -1, history: state.dataset.alarms.map(initial => ({ initial })), open: new Map() };
    for (const h of timeline.history) if (isActive(h.initial) && h.initial.tagId !== null) {
      const list = timeline.open.get(h.initial.tagId) ?? [];
      list.push(h);
      timeline.open.set(h.initial.tagId, list);
    }
    timelines.set(state.overlay, timeline);
  }
  if (tick <= timeline.through) return timeline;
  const ctx = contextOf(state.dataset), from = timeline.through;
  const changes = alarmTransitions(state.dataset, state.overlay, from, tick)
    .map(c => ({ tick: c.tick, tagId: c.tagId, level: c.level }));
  // Load and the start of each run span admit conditions that were already in alarm while stopped.
  for (const line of state.dataset.lines) {
    const boundaries = new Set<number>(from < 0 ? [0] : []);
    for (const span of [...state.manualStops[line.id], ...state.faultStops[line.id]]) {
      if (span.toTick > from && span.toTick <= tick) boundaries.add(span.toTick);
    }
    for (const boundary of boundaries) {
      if (state.overlay.runTicks!(line.id, boundary, boundary + 1) === 0 && boundary !== 0) continue;
      for (const tag of ctx.tagById.values()) if (tag.lineId === line.id) {
        changes.push({ tick: boundary, tagId: tag.id, level: alarmedAt(ctx, tag, boundary, state.overlay) });
      }
    }
  }
  changes.sort((a, b) => a.tick - b.tick || a.tagId.localeCompare(b.tagId));
  for (const change of changes) {
    const tag = ctx.tagById.get(change.tagId)!;
    const open = timeline.open.get(tag.id) ?? [];
    const kept: History[] = [];
    for (const h of open) {
      if (directionOf(h.initial) !== change.level) h.returnedTick = change.tick;
      else kept.push(h);
    }
    if (change.level !== null && kept.length === 0 && state.overlay.runTicks!(tag.lineId, change.tick, change.tick + 1) > 0) {
      const r = raiseAt(state.dataset, tag, change.tick, change.level);
      const h: History = { initial: {
        id: r.id, priority: r.priority, state: 'active-unacknowledged', lineId: r.lineId, machineId: r.machineId,
        tagId: r.tagId, batchId: r.batchId, message: r.message, raisedAt: r.time,
        acknowledgedAt: null, acknowledgedBy: null, returnedAt: null, clearedAt: null,
      } };
      timeline.history.push(h);
      kept.push(h);
    }
    timeline.open.set(tag.id, kept);
  }
  for (const h of timeline.history) if (h.initial.tagId === null && isActive(h.initial) && h.initial.message.key !== 'alarm.comm-loss') {
    const back = returnTickOf(h.initial.id);
    if (back <= tick) h.returnedTick = back;
  }
  timeline.through = tick;
  return timeline;
}

/**
 * Alarms at this tick, derived from the Simulator, run spans and acknowledgements. Queries do not change Plant State.
 * The per-Overlay timeline extends only through new ticks. Historical views project its records back to the requested
 * tick, so future queries cannot change earlier results. Acknowledgements are projected separately from condition history.
 */
export function alarmList(state: PlantState, tick: number): readonly Alarm[] {
  assertTick(tick);
  if (tick < 0) throw new Error('alarmList needs a tick of 0 or more');
  const known = views.get(state);
  if (known?.tick === tick) return known.list;
  const timeline = extend(state, tick), time = simulatedTime(tick), list: Alarm[] = [];
  for (const h of timeline.history) {
    if (h.initial.raisedAt > time) continue;
    let alarm = { ...h.initial };
    const back = h.returnedTick !== undefined && h.returnedTick <= tick ? h.returnedTick : undefined;
    const ack = state.acks.get(alarm.id);
    if (back !== undefined && (!ack || back <= ack.tick)) alarm = applyReturn(alarm, back);
    if (ack && ack.tick <= tick) alarm = acknowledge(alarm, ack.tick, ack.userId) ?? alarm;
    if (back !== undefined && ack && back > ack.tick) alarm = applyReturn(alarm, back);
    list.push(alarm);
  }
  views.set(state, { tick, list });
  return list;
}

/**
 * Resume changes run spans only from this tick. Reuse the existing timeline through the previous
 * tick, then let the same derivation admit conditions at the new run boundary. Copy records so a
 * probe cannot change past or future queries on the source Overlay.
 */
export function alarmListAfterResume(source: PlantState, resumed: PlantState, tick: number): readonly Alarm[] {
  if (!timelines.has(resumed.overlay)) {
    const time = simulatedTime(tick);
    const seeded = new Set(source.dataset.alarms);
    const history = extend(source, tick).history.filter(h => seeded.has(h.initial) || h.initial.raisedAt < time).map((h): History => ({
      initial: h.initial,
      ...(h.returnedTick !== undefined && h.returnedTick < tick ? { returnedTick: h.returnedTick } : {}),
    }));
    const open = new Map<string, History[]>();
    for (const h of history) if (isActive(h.initial) && h.initial.tagId !== null && h.returnedTick === undefined) {
      const list = open.get(h.initial.tagId) ?? [];
      list.push(h);
      open.set(h.initial.tagId, list);
    }
    timelines.set(resumed.overlay, { through: tick - 1, history, open });
  }
  return alarmList(resumed, tick);
}

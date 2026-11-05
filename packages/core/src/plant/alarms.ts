import type { Alarm } from '../mock/types';
import { simulatedTime } from '../sim/clock';
import { raiseAt, raises, returns, type Raise } from '../sim/alarms';
import { contextOf } from '../sim/context';
import { alarmedAt } from '../sim/tags';
import { tagSeries } from '../sim/series';
import type { PlantState } from './types';

const isOpen = (a: Alarm) => a.state === 'active-unacknowledged' || a.state === 'active-acknowledged';
const directionOf = (a: Alarm) => (a.message.key === 'alarm.low-value' ? 'low' : 'high');

/** An Alarm whose condition ended: unacknowledged waits to be acknowledged, acknowledged is cleared. */
function applyReturn(a: Alarm, tick: number): Alarm {
  const time = simulatedTime(tick);
  return a.state === 'active-unacknowledged' ? { ...a, state: 'returned-unacknowledged', returnedAt: time } : { ...a, state: 'cleared', returnedAt: time, clearedAt: time };
}

/** Whether an Alarm covered this condition at a tick, even if this advance has already returned it. */
function covers(alarm: Alarm, raise: Raise): boolean {
  return alarm.tagId === raise.tagId && directionOf(alarm) === raise.direction && alarm.raisedAt <= raise.time &&
    (alarm.returnedAt === null ? isOpen(alarm) : alarm.returnedAt > raise.time);
}

/**
 * Transitions supply ordinary raises. Levels at run boundaries recover conditions first seen while stopped.
 * Candidates are ordered by tick and Tag before allocating ids, so advance chunk sizes cannot change history.
 */
export function advanceTo(state: PlantState, tick: number): PlantState {
  if (tick < state.syncedTick) return state;
  const d = state.dataset, from = state.syncedTick, ctx = contextOf(d);
  let changed = false, alarmId = state.ids.alarms;
  const returnTag = (alarm: Alarm, firstTick: number): Alarm => {
    if (!isOpen(alarm) || alarm.tagId === null) return alarm;
    const back = tagSeries(d, alarm.tagId, firstTick, tick, 1, state.overlay).find(p => p.alarm !== directionOf(alarm));
    return back ? applyReturn(alarm, back.tick) : alarm;
  };
  const alarms = state.alarms.map(alarm => {
    const next = returnTag(alarm, Math.min(from + 1, tick));
    if (next !== alarm) changed = true;
    return next;
  });
  for (const returned of returns(d, from, tick)) {
    const index = alarms.findIndex(a => a.id === returned.alarmId);
    const alarm = alarms[index];
    if (alarm && isOpen(alarm)) { alarms[index] = applyReturn(alarm, returned.tick); changed = true; }
  }

  const candidates = raises(d, from, tick, state.overlay);
  // The first examined tick and every Resume are where a level can have lost its transition while stopped.
  for (const line of d.lines) {
    const boundaries = new Set([Math.min(from + 1, tick)]);
    for (const span of [...state.manualStops[line.id], ...state.faultStops[line.id]]) {
      if (span.toTick >= from && span.toTick <= tick) boundaries.add(span.toTick);
    }
    for (const boundary of boundaries) {
      if (state.overlay.runTicks!(line.id, boundary, boundary + 1) === 0) continue;
      for (const tag of ctx.tagById.values()) {
        if (tag.lineId !== line.id) continue;
        const direction = alarmedAt(ctx, tag, boundary, state.overlay);
        if (direction !== null) candidates.push(raiseAt(d, tag, boundary, direction));
      }
    }
  }
  const admit = (raise: Raise) => {
    if (state.overlay.runTicks!(raise.lineId, raise.tick, raise.tick + 1) === 0 || alarms.some(a => covers(a, raise))) return;
    const fresh: Alarm = {
      id: `AL-${String(++alarmId).padStart(4, '0')}`, priority: raise.priority,
      state: 'active-unacknowledged', lineId: raise.lineId, machineId: raise.machineId,
      tagId: raise.tagId, batchId: raise.batchId, message: raise.message, raisedAt: raise.time,
      acknowledgedAt: null, acknowledgedBy: null, returnedAt: null, clearedAt: null,
    };
    alarms.push(returnTag(fresh, raise.tick + 1));
    changed = true;
  };
  candidates.sort((a, b) => a.tick - b.tick || a.tagId.localeCompare(b.tagId)).forEach(admit);

  // Safety net at the requested tick. Ordinary transitions and run boundaries normally cover every level already.
  const missing: Raise[] = [];
  for (const tag of ctx.tagById.values()) {
    if (state.overlay.runTicks!(tag.lineId, tick, tick + 1) === 0) continue;
    const direction = alarmedAt(ctx, tag, tick, state.overlay);
    if (direction === null || alarms.some(a => isOpen(a) && a.tagId === tag.id && directionOf(a) === direction)) continue;
    const resumes = [...state.manualStops[tag.lineId], ...state.faultStops[tag.lineId]].filter(s => s.toTick <= tick).map(s => s.toTick);
    const first = Math.max(Math.min(from + 1, tick), ...resumes);
    missing.push(raiseAt(d, tag, first, direction));
  }
  missing.sort((a, b) => a.tick - b.tick || a.tagId.localeCompare(b.tagId)).forEach(admit);
  return {
    ...state, syncedTick: tick,
    ids: alarmId === state.ids.alarms ? state.ids : { ...state.ids, alarms: alarmId },
    alarms: changed ? alarms : state.alarms,
  };
}

/** Acknowledges one Alarm: active becomes acknowledged, returned to normal becomes cleared, anything else stays. */
export function acknowledge(a: Alarm, tick: number, userId: string): Alarm | null {
  const time = simulatedTime(tick);
  if (a.state === 'active-unacknowledged') return { ...a, state: 'active-acknowledged', acknowledgedAt: time, acknowledgedBy: userId };
  if (a.state === 'returned-unacknowledged') return { ...a, state: 'cleared', acknowledgedAt: time, acknowledgedBy: userId, clearedAt: time };
  return null;
}

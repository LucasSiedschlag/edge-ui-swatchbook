import type { Alarm } from '../mock/types';
import { simulatedTime } from '../sim/clock';
import { raises, returns } from '../sim/alarms';
import { tagSeries } from '../sim/series';
import type { PlantState } from './types';

const isOpen = (a: Alarm) => a.state === 'active-unacknowledged' || a.state === 'active-acknowledged';
const directionOf = (a: Alarm) => (a.message.key === 'alarm.low-value' ? 'low' : 'high');

/** An Alarm whose condition ended: unacknowledged waits to be acknowledged, acknowledged is cleared. */
function applyReturn(a: Alarm, tick: number): Alarm {
  const time = simulatedTime(tick);
  return a.state === 'active-unacknowledged' ? { ...a, state: 'returned-unacknowledged', returnedAt: time } : { ...a, state: 'cleared', returnedAt: time, clearedAt: time };
}

/**
 * Brings the Alarms up to a tick: Alarms on a Tag return when the Tag is out of alarm, faults return at their own tick, and
 * every raise of the Simulator on a running Line becomes a new Alarm. A raise on a stopped Line is ignored.
 * Moving time in one step or in many gives the same Alarms.
 */
export function advanceTo(state: PlantState, tick: number): PlantState {
  if (tick <= state.syncedTick) return state;
  const d = state.dataset;
  const from = state.syncedTick;
  const alarms = state.alarms.map((a) => a);
  let changed = false;

  alarms.forEach((a, i) => {
    if (!isOpen(a)) return;
    if (a.tagId !== null) {
      const dir = directionOf(a);
      const back = tagSeries(d, a.tagId, from + 1, tick, 1, state.overlay).find((p) => p.alarm !== dir);
      if (back) {
        alarms[i] = applyReturn(a, back.tick);
        changed = true;
      }
    }
  });
  for (const r of returns(d, from, tick)) {
    const i = alarms.findIndex((a) => a.id === r.alarmId);
    const a = alarms[i];
    if (a && isOpen(a)) {
      alarms[i] = applyReturn(a, r.tick);
      changed = true;
    }
  }

  for (const r of raises(d, from, tick, state.overlay)) {
    if (state.overlay.runTicks?.(r.lineId, r.tick, r.tick + 1) === 0) continue;
    const fresh: Alarm = {
      id: `AL-${String(alarms.length + 1).padStart(4, '0')}`,
      priority: r.priority,
      state: 'active-unacknowledged',
      lineId: r.lineId,
      machineId: r.machineId,
      tagId: r.tagId,
      batchId: r.batchId,
      message: r.message,
      raisedAt: r.time,
      acknowledgedAt: null,
      acknowledgedBy: null,
      returnedAt: null,
      clearedAt: null,
    };
    const back = tagSeries(d, r.tagId, r.tick + 1, tick, 1, state.overlay).find((p) => p.alarm !== r.direction);
    alarms.push(back ? applyReturn(fresh, back.tick) : fresh);
    changed = true;
  }
  // Time moved on, but if no Alarm changed the Alarms stay the very same list, so nothing downstream sees a change.
  return { ...state, syncedTick: tick, alarms: changed ? alarms : state.alarms };
}

/** Acknowledges one Alarm: active becomes acknowledged, returned to normal becomes cleared, anything else stays. */
export function acknowledge(a: Alarm, tick: number, userId: string): Alarm | null {
  const time = simulatedTime(tick);
  if (a.state === 'active-unacknowledged') return { ...a, state: 'active-acknowledged', acknowledgedAt: time, acknowledgedBy: userId };
  if (a.state === 'returned-unacknowledged') return { ...a, state: 'cleared', acknowledgedAt: time, acknowledgedBy: userId, clearedAt: time };
  return null;
}

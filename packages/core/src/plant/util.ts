import type { EventAction, EventLogEntry } from '../mock/types';
import { simulatedTime } from '../sim/clock';
import { buildOverlay } from './state';
import type { ActionResult, PlantError, PlantState } from './types';

export const nothing = (state: PlantState): ActionResult => ({ ok: true, state, events: [] });
export const refuse = (code: PlantError['code'], detail: Omit<PlantError, 'code'> = {}): ActionResult => ({ ok: false, error: { code, ...detail } });

export function entry(
  state: PlantState,
  tick: number,
  action: EventAction,
  target: string,
  kind: EventLogEntry['targetKind'],
  oldValue: EventLogEntry['oldValue'] = null,
  newValue: EventLogEntry['newValue'] = null,
): EventLogEntry {
  return {
    id: `EV-${String(state.ids.events + 1).padStart(4, '0')}`,
    at: simulatedTime(tick),
    userId: state.currentUserId,
    action,
    targetKind: kind,
    target,
    oldValue,
    newValue,
    note: null,
  };
}

/** Returns a new state with the changes, and the Event Log entries to add. */
export function commit(state: PlantState, changes: Partial<PlantState>, events: EventLogEntry[]): ActionResult {
  const next: PlantState = { ...state, ...changes, ids: { ...(changes.ids ?? state.ids), events: state.ids.events + events.length }, events: [...state.events, ...events] };
  const overlayChanged = next.manualStops !== state.manualStops || next.faultStops !== state.faultStops || next.setpoints !== state.setpoints;
  return { ok: true, state: overlayChanged ? { ...next, overlay: buildOverlay(next.manualStops, next.faultStops, next.setpoints.size > 0 ? next.setpoints : undefined) } : next, events };
}


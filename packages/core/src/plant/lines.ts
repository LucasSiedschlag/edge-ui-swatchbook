import type { LineId } from '../mock/types';
import type { LineStatus, PlantState, StopReason } from './types';

const NEVER = Number.POSITIVE_INFINITY;

function criticalAlarms(state: PlantState, lineId: LineId): number {
  return state.alarms.filter((a) => a.lineId === lineId && a.priority === 'critical' && (a.state === 'active-unacknowledged' || a.state === 'active-acknowledged')).length;
}

/** Status of a Line at a tick: Alarm with a Critical Alarm, else Stopped for the first reason that applies, else Running. */
export function lineStatus(state: PlantState, lineId: LineId, tick: number): LineStatus {
  const control = state.controls[lineId];
  const fault = (state.faultStops[lineId] ?? []).some((s) => tick >= s.fromTick && tick < s.toTick);
  const reason: StopReason | null = control?.latched ? 'emergency-stop' : fault ? 'fault' : control?.paused ? 'paused' : null;
  const critical = criticalAlarms(state, lineId);
  return { status: critical > 0 ? 'alarm' : reason ? 'stopped' : 'running', reason, criticalAlarms: critical };
}

export { NEVER };

import { reconcileAt } from './alarms';
import type { LineId } from '../mock/types';
import type { LineStatus, PlantState, StopReason } from './types';

const NEVER = Number.POSITIVE_INFINITY;

function criticalAlarms(state: PlantState, lineId: LineId): number {
  return reconcileAt(state).alarms.filter((a) => a.lineId === lineId && a.priority === 'critical' && (a.state === 'active-unacknowledged' || a.state === 'active-acknowledged')).length;
}

/** Stop reasons use historical spans. Critical Alarm counts include the open tick without finalizing its history. */
export function lineStatus(state: PlantState, lineId: LineId, tick = state.syncedTick): LineStatus {
  const manual = (state.manualStops[lineId] ?? []).find(s => tick >= s.fromTick && tick < s.toTick);
  const fault = (state.faultStops[lineId] ?? []).some((s) => tick >= s.fromTick && tick < s.toTick);
  const reason: StopReason | null = manual?.reason === 'emergency-stop' ? 'emergency-stop' : fault ? 'fault' : manual?.reason ?? null;
  const critical = criticalAlarms(state, lineId);
  return { status: critical > 0 ? 'alarm' : reason ? 'stopped' : 'running', reason, criticalAlarms: critical };
}

export { NEVER };

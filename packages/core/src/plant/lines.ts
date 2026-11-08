import { alarmList, isActive } from './alarms';
import { simulatedTime } from '../sim/clock';
import type { LineId } from '../mock/types';
import type { LineStatus, PlantState, StopReason } from './types';

import { NEVER } from '../limits';

/** Screen 1 banner data. Age is seconds at the requested tick. */
export function criticalAlarms(state: PlantState, lineId: LineId, tick = state.lastTick) {
  return alarmList(state, tick).filter(a => a.lineId === lineId && a.priority === 'critical' && isActive(a))
    .map(a => ({ ...a, machine: state.dataset.machines.find(m => m.id === a.machineId)!, age: (simulatedTime(tick) - a.raisedAt) / 1000 }));
}

/** Stop reasons and Critical Alarm counts both describe the requested tick. */
export function lineStatus(state: PlantState, lineId: LineId, tick = state.lastTick): LineStatus {
  const manual = (state.manualStops[lineId] ?? []).find(s => tick >= s.fromTick && tick < s.toTick);
  const fault = (state.faultStops[lineId] ?? []).some((s) => tick >= s.fromTick && tick < s.toTick);
  const reason: StopReason | null = manual?.reason === 'emergency-stop' ? 'emergency-stop' : fault ? 'fault' : manual?.reason ?? null;
  const critical = criticalAlarms(state, lineId, tick).length;
  return { status: critical > 0 ? 'alarm' : reason ? 'stopped' : 'running', reason, criticalAlarms: critical };
}

export { NEVER };

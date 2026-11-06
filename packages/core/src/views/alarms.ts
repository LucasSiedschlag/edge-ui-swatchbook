import type { AlarmPriority, AlarmState, AreaId, LineId, TextRef, Timestamp } from '../mock/types';
import { alarmList } from '../plant';
import type { PlantState } from '../plant';
import { simulatedTime } from '../sim/clock';

export interface AlarmFilters {
  priorities?: AlarmPriority[];
  /** Default: every state except cleared. */
  states?: AlarmState[];
  areaId?: AreaId;
  lineId?: LineId;
}

export interface AlarmRow {
  id: string;
  priority: AlarmPriority;
  state: AlarmState;
  lineId: LineId;
  areaId: AreaId;
  machineId: string;
  tagId: string | null;
  message: TextRef;
  raisedAt: Timestamp;
  ageSeconds: number;
  acknowledgedBy: string | null;
  canAcknowledge: boolean;
}

const RANK: Record<AlarmPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const DEFAULT_STATES: AlarmState[] = ['active-unacknowledged', 'active-acknowledged', 'returned-unacknowledged'];

/**
 * The Control Room Alarm list (Screen 6). Sorted by priority (critical first), then oldest raised first,
 * then id. Cleared Alarms are hidden unless `states` asks for them. Filters combine with AND.
 */
export function alarmListView(state: PlantState, tick: number, filters: AlarmFilters = {}): { rows: AlarmRow[]; empty: boolean } {
  const now = simulatedTime(tick);
  const states = filters.states ?? DEFAULT_STATES;
  const areaOfLine = new Map(state.dataset.lines.map((l) => [l.id, l.areaId]));
  const rows: AlarmRow[] = [];
  for (const a of alarmList(state, tick)) {
    const areaId = areaOfLine.get(a.lineId)!;
    if (!states.includes(a.state)) continue;
    if (filters.priorities && !filters.priorities.includes(a.priority)) continue;
    if (filters.areaId && filters.areaId !== areaId) continue;
    if (filters.lineId && filters.lineId !== a.lineId) continue;
    rows.push({
      id: a.id, priority: a.priority, state: a.state, lineId: a.lineId, areaId, machineId: a.machineId, tagId: a.tagId,
      message: a.message, raisedAt: a.raisedAt, ageSeconds: (now - a.raisedAt) / 1000, acknowledgedBy: a.acknowledgedBy,
      canAcknowledge: a.state === 'active-unacknowledged' || a.state === 'returned-unacknowledged',
    });
  }
  rows.sort((x, y) => RANK[x.priority] - RANK[y.priority] || x.raisedAt - y.raisedAt || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return { rows, empty: rows.length === 0 };
}

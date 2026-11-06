import type { LineId, TextRef } from '../mock/types';
import { criticalAlarms } from '../plant';
import type { PlantState } from '../plant';

export interface BannerRow {
  alarmId: string;
  machineId: string;
  message: TextRef;
  ageSeconds: number;
}

/**
 * Critical Alarm banner of the Operations Live Deck (Screen 1). Minimized by default, so the Screen
 * shows `count` and can expand only when there is something to list. Rows are oldest first, like the Alarm list.
 */
export function criticalBannerView(state: PlantState, tick: number, lineId: LineId): { count: number; expandable: boolean; rows: BannerRow[] } {
  const rows = criticalAlarms(state, lineId, tick)
    .map((a) => ({ alarmId: a.id, machineId: a.machineId, message: a.message, ageSeconds: a.age, raisedAt: a.raisedAt }))
    .sort((a, b) => a.raisedAt - b.raisedAt || (a.alarmId < b.alarmId ? -1 : 1))
    .map(({ raisedAt: _raisedAt, ...row }) => row);
  return { count: rows.length, expandable: rows.length > 0, rows };
}

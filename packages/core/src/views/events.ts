import type { EventAction, EventTargetKind, Role, Timestamp } from '../mock/types';
import type { PlantState } from '../plant';
import { simulatedTime } from '../sim/clock';

/** The four standard time ranges (same ids as the other Screens). */
import { type RangeId, rangeWindow } from './ranges';
export type { RangeId } from './ranges';

export interface EventFilters {
  userId?: string;
  actions?: EventAction[];
  range?: RangeId;
}

export interface EventRow {
  id: string;
  at: Timestamp;
  userId: string;
  userName: string;
  role: Role;
  action: EventAction;
  targetKind: EventTargetKind;
  target: string;
  oldValue: string | number | null;
  newValue: string | number | null;
  /** Plain typed text or a TextRef, as stored. */
  note: string | { key: string; params?: Record<string, string | number> } | null;
}

/** An entry is in a range when it falls in the window every Screen shares: from its first instant (included) to its end (excluded). */
function inRange(range: RangeId, at: Timestamp, tick: number): boolean {
  const w = rangeWindow(range, tick);
  return at >= w.start && at < w.end;
}

/** The Event Log (Screen 6): newest first, then id descending. Entries after the simulated time are not shown yet. */
export function eventLogView(state: PlantState, tick: number, filters: EventFilters = {}): { rows: EventRow[]; empty: boolean } {
  const now = simulatedTime(tick);
  const users = new Map(state.dataset.users.map((u) => [u.id, u]));
  const rows: EventRow[] = [];
  for (const e of state.events) {
    if (e.at > now) continue;
    if (filters.userId !== undefined && e.userId !== filters.userId) continue;
    if (filters.actions && !filters.actions.includes(e.action)) continue;
    if (filters.range && !inRange(filters.range, e.at, tick)) continue;
    const user = users.get(e.userId)!;
    rows.push({
      id: e.id, at: e.at, userId: e.userId, userName: user.name, role: user.role, action: e.action,
      targetKind: e.targetKind, target: e.target, oldValue: e.oldValue, newValue: e.newValue, note: e.note,
    });
  }
  rows.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return { rows, empty: rows.length === 0 };
}

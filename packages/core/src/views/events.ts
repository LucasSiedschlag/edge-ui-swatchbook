import { normalizeFilters, type FilterInput } from './filters';
import { assertSessionTick } from '../sim/context';
import type { EventAction, EventTargetKind, Role, Timestamp } from '../mock/types';
import type { PlantState } from '../plant';
import { simulatedTime } from '../sim/clock';

/** The four standard time ranges (same ids as the other Screens). */
import { type RangeId, rangeWindow } from './ranges';
export type { RangeId } from './ranges';

export const EVENT_LOG_DEFAULT_RANGE: RangeId = 'last-24h';

interface EventFilterValues {
  userId?: string;
  actions?: EventAction[];
  range?: RangeId;
}
export type EventFilters = FilterInput<EventFilterValues>;

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

/** An entry is in a range when it falls in the rolling Event Log window: from its first instant (included) to its end (excluded). */
function inRange(range: RangeId, at: Timestamp, tick: number): boolean {
  const w = rangeWindow(range, tick);
  return at >= w.start && at < w.end;
}

/** The Event Log (Screen 6): newest first, with later insertions first when timestamps tie. Entries after the simulated time are not shown yet. */
export function eventLogView(state: PlantState, tick: number, input: EventFilters | null = {}): { rows: EventRow[]; empty: boolean } {
  const filters = normalizeFilters<EventFilterValues>(input);
  assertSessionTick(tick);
  const now = simulatedTime(tick);
  const users = new Map(state.dataset.users.map((u) => [u.id, u]));
  const rows: EventRow[] = [];
  // Start with later insertions; the stable timestamp sort preserves that order for ties.
  for (let i = state.events.length - 1; i >= 0; i--) {
    const e = state.events[i]!;
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
  rows.sort((a, b) => b.at - a.at);
  return { rows, empty: rows.length === 0 };
}

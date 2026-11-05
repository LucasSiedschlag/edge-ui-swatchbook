import { expect } from 'vitest';
import type { LineType, RecipeVersion } from '../mock/types';
import { contextOf } from '../sim/context';
import { setpointAt } from '../sim/overlay';
import { alarmedAt } from '../sim/tags';
import { lineStatus } from './lines';
import type { ActionResult, PlantAction, PlantState } from './types';

export const snapshot = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) =>
  item instanceof Map ? [...item] : typeof item === 'number' && !Number.isFinite(item) ? String(item) : item);
export const stateSnapshot = (state: PlantState): string => snapshot({ ...state, dataset: undefined });
export const identities = (state: PlantState): string[] => [
  ...state.alarms.map(a => a.id), ...state.events.map(e => e.id),
  ...state.recipeVersions.flatMap(v => [v.id, ...v.steps.flatMap(s => [s.id, ...s.parameters.map(p => p.id)])]),
];

/** Written independently of the production Dependency Rules, so a missing key cannot silently pass both. */
export function completeAndSafe(version: RecipeVersion, type: LineType): boolean {
  if (!version.steps.length) return false;
  const parameters = version.steps.flatMap(s => s.parameters);
  const value = (key: string) => parameters.find(p => p.key === key)?.setpoint;
  const inside = (key: string, min: number, max: number) => {
    const n = value(key);
    return n !== undefined && Number.isFinite(n) && n >= min && n <= max;
  };
  if (type === 'extrusion') {
    for (let i = 1; i <= 5; i++) {
      if (!inside(`barrel-zone-${i}`, 165, 195)) return false;
      if (i > 1 && Math.abs(value(`barrel-zone-${i}`)! - value(`barrel-zone-${i - 1}`)!) > 15) return false;
    }
    return Number.isFinite(value('die-pressure')) && Number.isFinite(value('screw-speed')) && value('die-pressure')! <= 150 + 4 * value('screw-speed')!;
  }
  if (type === 'assembly') return inside('weld-temperature', 240, 270) && inside('weld-time', 20, 40) && Number.isFinite(value('cycle-time')) && value('cycle-time')! < 120;
  return true;
}

export function assertPlantInvariants(before: PlantState, action: PlantAction, tick: number, result: ActionResult, seen: Set<string>): void {
  const label = `${action.type} at ${tick}`;
  if (seen.size === 0) identities(before).forEach(id => seen.add(id));
  if (!result.ok) {
    expect(result).not.toHaveProperty('events');
    expect(result.error.code, label).toBeTruthy();
    return;
  }
  const previousIds = new Set(identities(before));
  for (const field of ['versionId', 'stepId', 'parameterId'] as const) {
    if (field in action) {
      const id = (action as unknown as Record<string, string>)[field]!;
      expect(seen.has(id) && !previousIds.has(id), `${label}: deleted ${field} is refused`).toBe(false);
    }
  }
  const state = result.state;
  expect(Number.isInteger(state.syncedTick) && state.syncedTick >= 0, `${label}: valid clock`).toBe(true);
  expect(state.syncedTick, `${label}: clock never reverses`).toBeGreaterThanOrEqual(before.syncedTick);
  const oldIds = new Set(identities(before));
  const ids = identities(state);
  expect(new Set(ids).size, `${label}: unique identities`).toBe(ids.length);
  for (const id of ids) {
    if (!oldIds.has(id)) expect(seen.has(id), `${label}: identity ${id} never reissued`).toBe(false);
    seen.add(id);
  }
  for (let i = 1; i < state.events.length; i++) expect(state.events[i]!.at, `${label}: chronological events`).toBeGreaterThanOrEqual(state.events[i - 1]!.at);
  for (const line of state.dataset.lines) {
    const spans = state.manualStops[line.id];
    const open = spans.filter(s => s.toTick === Infinity);
    expect(open.length, `${label}: one stop`).toBe(Number(state.controls[line.id].paused || state.controls[line.id].latched));
    spans.forEach((s, i) => {
      expect(s.fromTick, `${label}: forward span`).toBeLessThanOrEqual(s.toTick);
      if (i) expect(s.fromTick, `${label}: nonoverlapping spans`).toBeGreaterThanOrEqual(spans[i - 1]!.toTick);
    });
    const a = Math.max(0, state.syncedTick - 25), b = state.syncedTick, c = b + 25;
    const run = (from: number, to: number) => state.overlay.runTicks!(line.id, from, to);
    expect(run(a, c), `${label}: additive production`).toBe(run(a, b) + run(b, c));
    expect(run(a, c)).toBeGreaterThanOrEqual(0);
    expect(run(a, c)).toBeLessThanOrEqual(c - a);
    for (const t of new Set([a, ...spans.map(s => s.fromTick)])) {
      if (t < b && run(t, t + 1) === 0) expect(lineStatus(state, line.id, t).status, `${label}: historical status`).not.toBe('running');
    }
  }
  for (const tag of state.dataset.tags) {
    const steps = state.setpoints.get(tag.id) ?? [];
    steps.forEach((s, i) => {
      expect(Number.isFinite(s.value) && Number.isInteger(s.fromTick), `${label}: finite override`).toBe(true);
      if (i) expect(s.fromTick).toBeGreaterThan(steps[i - 1]!.fromTick);
    });
    const effective = Math.max(tick, before.syncedTick);
    for (const t of new Set([0, before.syncedTick, effective, ...[...steps, ...(before.setpoints.get(tag.id) ?? [])].flatMap(s => [s.fromTick - 1, s.fromTick])])) {
      if (t <= effective) expect(setpointAt(state.overlay, tag, t), `${label}: observed setpoint at ${t}`).toBe(setpointAt(before.overlay, tag, t));
    }
    if (action.type === 'advance') {
      const level = alarmedAt(contextOf(state.dataset), tag, state.syncedTick, state.overlay);
      const open = state.alarms.filter(a => a.tagId === tag.id && (a.state === 'active-unacknowledged' || a.state === 'active-acknowledged'));
      for (const alarm of open) expect(alarm.message.key === 'alarm.low-value' ? 'low' : 'high', `${label}: Alarm agrees with level`).toBe(level);
      if (state.overlay.runTicks!(tag.lineId, state.syncedTick, state.syncedTick + 1) > 0 && level !== null) expect(open.length, `${label}: level has one Alarm`).toBe(1);
    }
  }
  for (const v of state.recipeVersions) {
    expect(v.steps.map(s => s.order), `${label}: contiguous Steps`).toEqual(v.steps.map((_, i) => i + 1));
    const ps = v.steps.flatMap(s => s.parameters);
    expect(new Set(ps.map(p => p.key)).size, `${label}: unique Parameter keys`).toBe(ps.length);
    for (const p of ps) expect([p.min, p.setpoint, p.max].every(Number.isFinite) && p.min <= p.setpoint && p.setpoint <= p.max, `${label}: ordered Parameters`).toBe(true);
    const old = before.recipeVersions.find(x => x.id === v.id && x.status === 'approved');
    if (old) expect(v, `${label}: Approved content is immutable`).toEqual(old);
    if ((action.type === 'save-draft' || action.type === 'approve') && action.versionId === v.id) expect(completeAndSafe(v, state.dataset.recipes.find(r => r.id === v.recipeId)!.lineType), `${label}: independently safe Recipe`).toBe(true);
  }
  for (const recipe of state.dataset.recipes) expect(state.recipeVersions.filter(v => v.recipeId === recipe.id && v.status === 'draft').length).toBeLessThanOrEqual(1);
  for (const a of before.alarms) {
    const next = state.alarms.find(x => x.id === a.id)!;
    const allowed = {
      'active-unacknowledged': ['active-unacknowledged', 'active-acknowledged', 'returned-unacknowledged', 'cleared'],
      'active-acknowledged': ['active-acknowledged', 'cleared'],
      'returned-unacknowledged': ['returned-unacknowledged', 'cleared'], cleared: ['cleared'],
    };
    expect(allowed[a.state], `${label}: valid Alarm transitions`).toContain(next.state);
    // Advance then acknowledge can traverse two legal moves in one action.
    if (a.state === 'active-unacknowledged' && next.state === 'cleared') expect(next.returnedAt !== null && next.acknowledgedAt !== null).toBe(true);
  }
}

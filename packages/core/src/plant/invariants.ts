import { expect } from 'vitest';
import type { LineType, RecipeVersion } from '../mock/types';
import { contextOf, MAX_TICK } from '../sim/context';
import { setpointAt } from '../sim/overlay';
import { alarmedAt } from '../sim/tags';
import { alarmList } from './alarms';
import { lineStatus } from './lines';
import type { ActionResult, PlantAction, PlantState } from './types';

export const snapshot = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) =>
  item instanceof Map ? [...item] : typeof item === 'number' && !Number.isFinite(item) ? String(item) : item);
export const stateSnapshot = (state: PlantState): string => snapshot({ ...state, dataset: undefined });
/** Allocated identities. Alarm identities are derived and checked against their condition below. */
export const identities = (state: PlantState): string[] => [
  ...state.events.map(e => e.id),
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

/** Snapshot only fields an action can change, including its last accepted tick. */
export function actionSnapshot(state: PlantState, action: PlantAction): string {
  const common = { ids: state.ids, lastTick: state.lastTick, acks: state.acks, events: state.events };
  switch (action.type) {
    case 'pause': case 'resume': case 'reset': case 'emergency-stop':
      return snapshot({ ...common, controls: state.controls, manualStops: state.manualStops });
    case 'setpoint-override': case 'reset-to-recipe': return snapshot({ ...common, setpoints: state.setpoints });
    case 'set-user': return snapshot({ ...common, currentUserId: state.currentUserId });
    case 'shift-handover': return snapshot({ ...common, handovers: state.handovers });
    case 'acknowledge': return snapshot(common);
    default: return snapshot({ ...common, recipeVersions: state.recipeVersions, savedDrafts: state.savedDrafts });
  }
}

export function assertPlantInvariants(before: PlantState, action: PlantAction, tick: number, result: ActionResult, seen: Set<string>): void {
  const label = `${action.type} at ${tick}`;
  // Each invariant reports its first offender with one contextual assertion.
  const check = (name: string, offender: unknown) => expect(offender, `${label}: ${name}`).toBeUndefined();
  if (seen.size === 0) identities(before).forEach(id => seen.add(id));
  if (!result.ok) {
    check('refusal shape', !('events' in result) && result.error.code ? undefined : result);
    return;
  }
  const state = result.state, effective = Math.max(tick, before.lastTick);
  const oldIds = new Set(identities(before)), ids = identities(state);
  check('deleted identities are refused', ['versionId', 'stepId', 'parameterId'].find(field => {
    const id = (action as unknown as Record<string, string>)[field];
    return id !== undefined && seen.has(id) && !oldIds.has(id);
  }));
  check('valid monotonic clock', Number.isSafeInteger(state.lastTick) && state.lastTick >= before.lastTick ? undefined : state.lastTick);
  const unique = new Set<string>();
  check('unique identities', ids.find(id => {
    if (unique.has(id)) return true;
    unique.add(id);
    return false;
  }));
  check('identities never reissued', ids.find(id => !oldIds.has(id) && seen.has(id)));
  ids.forEach(id => seen.add(id));
  check('chronological events', state.events.find((e, i) => i > 0 && e.at < state.events[i - 1]!.at)?.id);
  check('one open stop', state.dataset.lines.find(line => state.manualStops[line.id].filter(s => s.toTick === Infinity).length !== Number(state.controls[line.id].paused || state.controls[line.id].latched))?.id);
  check('forward nonoverlapping spans', state.dataset.lines.find(line => state.manualStops[line.id].some((s, i, spans) => s.fromTick > s.toTick || (i > 0 && s.fromTick < spans[i - 1]!.toTick)))?.id);
  const a = Math.max(0, state.lastTick - 25), b = state.lastTick, c = b + 25;
  check('additive bounded production', state.dataset.lines.find(line => {
    const run = (from: number, to: number) => state.overlay.runTicks!(line.id, from, to);
    return run(a, c) !== run(a, b) + run(b, c) || run(a, c) < 0 || run(a, c) > c - a;
  })?.id);
  check('historical status follows production', state.dataset.lines.find(line => [...new Set([a, ...state.manualStops[line.id].map(s => s.fromTick)])].some(t =>
    t < b && state.overlay.runTicks!(line.id, t, t + 1) === 0 && lineStatus(state, line.id, t).status === 'running'))?.id);
  check('finite ordered overrides', [...state.setpoints].find(([, steps]) => steps.some((s, i) => !Number.isFinite(s.value) || !Number.isSafeInteger(s.fromTick) || (i > 0 && s.fromTick <= steps[i - 1]!.fromTick)))?.[0]);
  check('setpoint history before the effective tick is immutable', state.dataset.tags.find(tag => {
    const steps = [...(state.setpoints.get(tag.id) ?? []), ...(before.setpoints.get(tag.id) ?? [])];
    return [...new Set([0, before.lastTick, effective, ...steps.flatMap(s => [s.fromTick - 1, s.fromTick])])].some(t =>
      t < effective && setpointAt(state.overlay, tag, t) !== setpointAt(before.overlay, tag, t));
  })?.id);
  if (action.type === 'resume' && before.controls[action.lineId].paused && !state.controls[action.lineId].paused) check('successful Resume has no Critical Alarm', lineStatus(state, action.lineId).criticalAlarms === 0 ? undefined : action.lineId);
  const list = alarmList(state, effective), ctx = contextOf(state.dataset);
  check('unique Alarm identities', new Set(list.map(a => a.id)).size === list.length ? undefined : effective);
  check('stable derived identities', list.find(a => a.id.startsWith('RZ-') && a.id !== `RZ-${(a.raisedAt - state.dataset.now) / 1000}-${a.tagId}-${a.message.key === 'alarm.low-value' ? 'low' : 'high'}`)?.id);
  const openByTag = new Map<string, (typeof list[number])[]>();
  for (const alarm of list) {
    if (alarm.tagId !== null && (alarm.state === 'active-unacknowledged' || alarm.state === 'active-acknowledged')) {
      const open = openByTag.get(alarm.tagId) ?? [];
      open.push(alarm);
      openByTag.set(alarm.tagId, open);
    }
  }
  check('Alarm levels agree', [...ctx.tagById.values()].find(tag => {
    const hb = ctx.heartbeat.get(tag.machineId);
    if (hb !== undefined && effective >= hb) return (openByTag.get(tag.id)?.length ?? 0) > 0;
    const level = alarmedAt(ctx, tag, effective, state.overlay);
    const open = openByTag.get(tag.id) ?? [];
    return open.some(a => (a.message.key === 'alarm.low-value' ? 'low' : 'high') !== level) ||
      (state.overlay.runTicks!(tag.lineId, effective, effective + 1) > 0 && level !== null && open.length !== 1);
  })?.id);
  check('contiguous Steps', state.recipeVersions.find(v => v.steps.some((s, i) => s.order !== i + 1))?.id);
  check('unique Parameter keys', state.recipeVersions.find(v => {
    const ps = v.steps.flatMap(s => s.parameters);
    return new Set(ps.map(p => p.key)).size !== ps.length;
  })?.id);
  check('ordered finite Parameters', state.recipeVersions.find(v => v.steps.some(s => s.parameters.some(p => ![p.min, p.setpoint, p.max].every(Number.isFinite) || p.min > p.setpoint || p.setpoint > p.max)))?.id);
  check('Approved content is immutable', state.recipeVersions.find(v => {
    const old = before.recipeVersions.find(x => x.id === v.id && x.status === 'approved');
    return old !== undefined && old !== v && snapshot(v) !== snapshot(old);
  })?.id);
  if (action.type === 'save-draft' || action.type === 'approve') check('independently safe Recipe', state.recipeVersions.find(v => v.id === action.versionId && !completeAndSafe(v, state.dataset.recipes.find(r => r.id === v.recipeId)!.lineType))?.id);
  check('one Draft per Recipe', state.dataset.recipes.find(r => state.recipeVersions.filter(v => v.recipeId === r.id && v.status === 'draft').length > 1)?.id);
  const allowed = {
    'active-unacknowledged': ['active-unacknowledged', 'active-acknowledged', 'returned-unacknowledged', 'cleared'],
    'active-acknowledged': ['active-acknowledged', 'cleared'],
    'returned-unacknowledged': ['returned-unacknowledged', 'cleared'], cleared: ['cleared'],
  };
  check('Critical count agrees with Line status', state.dataset.lines.find(line => {
    const count = list.filter(a => a.lineId === line.id && a.priority === 'critical' && a.state.startsWith('active-')).length;
    return count !== lineStatus(state, line.id, effective).criticalAlarms;
  })?.id);
  const pastTick = Math.max(0, effective - 1), past = alarmList(state, pastTick);
  alarmList(state, Math.min(MAX_TICK, effective + 1));
  check('query order and prefix stability', JSON.stringify(alarmList(state, effective)) === JSON.stringify(list) && JSON.stringify(alarmList(state, pastTick)) === JSON.stringify(past) ? undefined : effective);
  if (effective > 0) check('actions preserve all earlier Alarm fields', JSON.stringify(past) === JSON.stringify(alarmList(before, pastTick)) ? undefined : effective);
  // Rebuild independently after every condition-history change. Acknowledgements and Recipe edits reuse that timeline.
  if (state.overlay !== before.overlay) check('independent query order', JSON.stringify(alarmList({ ...state, overlay: { ...state.overlay } }, effective)) === JSON.stringify(list) ? undefined : effective);
  const byId = new Map(list.map(a => [a.id, a]));
  // Compare from finalized history. Replacing a step at this tick can undo this tick's return.
  const previousTick = Math.min(before.lastTick, effective - 1);
  check('valid Alarm transitions', (previousTick < 0 ? [] : alarmList(before, previousTick)).find(a => {
    const next = byId.get(a.id);
    return !next || !allowed[a.state].includes(next.state) || (a.state === 'active-unacknowledged' && next.state === 'cleared' && (next.returnedAt === null || next.acknowledgedAt === null));
  })?.id);
}

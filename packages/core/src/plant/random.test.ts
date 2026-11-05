import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { createRng } from '../mock/prng';
import type { StepKind } from '../mock/types';
import { validateVersion } from './validation';
import { parametersByKey } from '../parameters';
import { simulate } from '../sim/simulate';
import { tagSeries } from '../sim/series';
import { raises } from '../sim/alarms';
import { simulatedTime } from '../sim/clock';
import { assertOverlay, setpointAt } from '../sim/overlay';
import { assertPlantInvariants, identities, snapshot, stateSnapshot } from './invariants';
import { createPlantState, createPlantStore, lineStatus, reduce } from './index';
import type { PlantAction, PlantState } from './types';

const kinds: StepKind[] = ['preheat', 'ramp', 'run', 'cooldown', 'load', 'process', 'inspect'];
function accepted(state: PlantState, action: PlantAction, tick: number): PlantState {
  const result = reduce(state, action, { tick });
  expect(result.ok, `${action.type} at ${tick}`).toBe(true);
  if (!result.ok) throw new Error(result.error.code);
  return result.state;
}
const fresh = () => createPlantState(generateMockDataset());
const draft = (s: PlantState) => s.recipeVersions.find(v => v.status === 'draft')!;

for (const seed of [1, 2, 3, 20260101]) it(`seed ${seed}: 300 actions preserve Plant State invariants and replay`, () => {
  const d = generateMockDataset(seed), original = snapshot(d), rng = createRng(seed);
  const store = createPlantStore(d), replay = createPlantStore(generateMockDataset(seed));
  const seen = new Set<string>(), deletedSteps: string[] = [], deletedParameters: string[] = [], deletedVersions: string[] = [];
  for (let step = 0; step < 300; step++) {
    const before = store.getState(), beforeSnapshot = stateSnapshot(before);
    const lineId = rng.pick(d.lines).id, tag = rng.pick(d.tags);
    const v = rng.pick(before.recipeVersions.filter(v => v.status === 'draft')) ?? rng.pick(before.recipeVersions);
    const s = rng.pick(v.steps.length ? v.steps : [{ id: 'missing', order: 1, kind: 'run' as const, name: { key: 'missing' }, parameters: [] }]);
    const parameterId = s.parameters.length ? rng.pick(s.parameters).id : 'missing';
    const versionId = rng.chance(0.12) ? rng.pick([...deletedVersions, 'missing']) : v.id;
    const stepId = rng.chance(0.2) ? rng.pick([...deletedSteps, 'missing']) : s.id;
    const actions: PlantAction[] = [
      { type: 'advance' }, { type: 'pause', lineId }, { type: 'resume', lineId },
      { type: 'emergency-stop', lineId, confirmed: rng.chance(0.7) }, { type: 'reset', lineId },
      { type: 'setpoint-override', tagId: tag.id, value: rng.pick([tag.min, tag.max, tag.setpoint, tag.max + 1, NaN]), reason: rng.pick(['trial', '']) },
      { type: 'reset-to-recipe', tagId: tag.id },
      { type: 'acknowledge', alarmIds: [rng.pick([...before.alarms.map(a => a.id), 'unknown'])] },
      { type: 'shift-handover', note: rng.pick(['handover', '']) },
      { type: 'set-user', userId: rng.pick([...d.users.map(u => u.id), 'unknown']) },
      { type: 'new-draft', versionId: rng.pick(before.recipeVersions.filter(v => v.status === 'approved')).id },
      { type: 'discard-draft', versionId }, { type: 'save-draft', versionId }, { type: 'approve', versionId },
      { type: 'add-step', versionId, kind: rng.pick(kinds) }, { type: 'remove-step', versionId, stepId },
      { type: 'reorder-step', versionId, stepId, toIndex: rng.int(-2, 10) },
      { type: 'edit-parameter', versionId, parameterId: rng.chance(0.2) ? rng.pick([...deletedParameters, 'missing']) : parameterId, field: rng.pick(['min', 'max', 'setpoint'] as const), value: rng.pick([0, 180, 200, 1000, NaN]) },
    ];
    const action = rng.pick(actions), tick = rng.chance(0.75) ? before.syncedTick + rng.int(1, 10) : rng.pick([before.syncedTick + rng.int(1, 10), before.syncedTick + 1, before.syncedTick, before.syncedTick - 10, -1, 1.5, NaN]);
    try {
      const result = store.dispatch(action, tick);
      expect(stateSnapshot(before), 'input unchanged').toBe(beforeSnapshot);
      expect(snapshot(d), 'Mock Dataset unchanged').toBe(original);
      if (!result.ok) {
        expect(store.getState(), 'refusal retains state identity').toBe(before);
        expect(stateSnapshot(store.getState())).toBe(beforeSnapshot);
      }
      assertPlantInvariants(before, action, tick, result, seen);
      const replayResult = replay.dispatch(action, tick);
      expect(replayResult.ok).toBe(result.ok);
      expect(stateSnapshot(replay.getState()), 'deterministic replay').toBe(stateSnapshot(store.getState()));
      const current = new Set(identities(store.getState()));
      for (const old of before.recipeVersions) {
        if (!current.has(old.id)) deletedVersions.push(old.id);
        for (const oldStep of old.steps) {
          if (!current.has(oldStep.id)) deletedSteps.push(oldStep.id);
          for (const p of oldStep.parameters) if (!current.has(p.id)) deletedParameters.push(p.id);
        }
      }
    } catch (error) { throw new Error(`seed ${seed}, step ${step}, ${action.type}, tick ${tick}: ${String(error)}`, { cause: error }); }
  }
}, 120000);

describe('root cause regressions', () => {
  it('rejects invalid ticks at ingress, including set-user', () => {
    for (const tick of [NaN, Infinity, -1, 1.5]) {
      const state = fresh();
      for (const action of [{ type: 'advance' }, { type: 'set-user', userId: state.currentUserId }] as const) expect(reduce(state, action, { tick })).toMatchObject({ ok: false, error: { code: 'invalid-tick' } });
    }
  });
  it('makes duplicate Parameter keys impossible through add-step, including R11-v3', () => {
    const state = fresh(), v = state.recipeVersions.find(v => v.id === 'R11-v3') ?? draft(state);
    const result = reduce(state, { type: 'add-step', versionId: v.id, kind: v.steps[0]!.kind }, { tick: 1 });
    expect(result).toMatchObject({ ok: false, error: { code: 'step-kind-exists' } });
  });
  it('never reuses a discarded Draft identity', () => {
    let state = fresh();
    const old = draft(state), approved = state.recipeVersions.find(v => v.recipeId === old.recipeId && v.status === 'approved')!;
    state = accepted(state, { type: 'discard-draft', versionId: old.id }, 1);
    state = accepted(state, { type: 'new-draft', versionId: approved.id }, 2);
    expect(state.recipeVersions.find(v => v.recipeId === old.recipeId && v.status === 'draft')!.id).not.toBe(old.id);
    expect(reduce(state, { type: 'approve', versionId: old.id }, { tick: 3 })).toMatchObject({ ok: false, error: { code: 'unknown-version' } });
  });
  it('never reuses deleted Step or Parameter identities', () => {
    let state = fresh(); const v = draft(state), step = v.steps[v.steps.length - 1]!;
    state = accepted(state, { type: 'remove-step', versionId: v.id, stepId: step.id }, 1);
    state = accepted(state, { type: 'add-step', versionId: v.id, kind: step.kind }, 2);
    expect(state.recipeVersions.find(x => x.id === v.id)!.steps.some(s => s.id === step.id)).toBe(false);
    expect(reduce(state, { type: 'remove-step', versionId: v.id, stepId: step.id }, { tick: 3 })).toMatchObject({ ok: false, error: { code: 'unknown-step' } });
    for (const p of step.parameters) expect(reduce(state, { type: 'edit-parameter', versionId: v.id, parameterId: p.id, field: 'setpoint', value: p.setpoint }, { tick: 3 })).toMatchObject({ ok: false, error: { code: 'unknown-parameter' } });
  });
  it('clamps an earlier Resume to the synchronized clock', () => {
    let state = accepted(fresh(), { type: 'pause', lineId: 'E2' }, 100);
    state = accepted(state, { type: 'resume', lineId: 'E2' }, 50);
    expect(state.manualStops.E2[0]!.toTick).toBe(100);
  });
  it('cannot rewrite an observed setpoint with an earlier override', () => {
    let state = fresh(); const tag = state.dataset.tags.find(t => t.id === 'E2-puller.puller-speed')!;
    state = accepted(state, { type: 'setpoint-override', tagId: tag.id, value: tag.max, reason: 'trial' }, 10);
    state = accepted(state, { type: 'advance' }, 100);
    const old = setpointAt(state.overlay, tag, 11);
    state = accepted(state, { type: 'setpoint-override', tagId: tag.id, value: tag.min, reason: 'trial' }, 5);
    expect(setpointAt(state.overlay, tag, 11)).toBe(old);
  });
  it('rejects NaN values and fractional step ticks at the Simulator boundary', () => {
    const state = fresh(), tagId = state.dataset.tags[0]!.id;
    for (const step of [{ fromTick: 1, value: NaN }, { fromTick: 1.5, value: 10 }]) {
      const overlay = { setpoints: new Map([[tagId, [step]]]) };
      expect(() => assertOverlay(overlay)).toThrow();
      expect(() => simulate(state.dataset, 10, overlay)).toThrow();
      expect(() => tagSeries(state.dataset, tagId, 0, 10, 1, overlay)).toThrow();
    }
  });
  it('refuses Save and Approve of an empty Draft', () => {
    let state = fresh(); const v = draft(state);
    for (const s of v.steps) state = accepted(state, { type: 'remove-step', versionId: v.id, stepId: s.id }, 1);
    for (const type of ['save-draft', 'approve'] as const) expect(reduce(state, { type, versionId: v.id }, { tick: 2 }).ok).toBe(false);
  });
  it('reconciles a level raised while stopped at the Resume tick', () => {
    let state = fresh(); const tag = state.dataset.tags.find(t => t.id === 'E2-puller.puller-speed')!;
    state = accepted(state, { type: 'pause', lineId: 'E2' }, 0);
    state = accepted(state, { type: 'setpoint-override', tagId: tag.id, value: tag.max, reason: 'trial' }, 0);
    state = accepted(state, { type: 'advance' }, 100);
    state = accepted(state, { type: 'resume', lineId: 'E2' }, 101);
    state = accepted(state, { type: 'advance' }, 110);
    expect(state.alarms.find(a => a.tagId === tag.id && a.raisedAt === simulatedTime(101))).toBeDefined();
  });
  it('does not admit the raise at tick 46 when Pause starts at 46', () => {
    const state = fresh(); const raise = raises(state.dataset, 45, 46)[0]!;
    expect(raise).toBeDefined();
    const paused = accepted(state, { type: 'pause', lineId: raise.lineId }, 46);
    expect(paused.alarms.some(a => a.tagId === raise.tagId && a.raisedAt === raise.time)).toBe(false);
  });
  it('projects past status from the same spans as production', () => {
    let state = accepted(fresh(), { type: 'pause', lineId: 'E2' }, 100);
    state = accepted(state, { type: 'resume', lineId: 'E2' }, 200);
    expect(lineStatus(state, 'E2', 150)).toMatchObject({ status: 'stopped', reason: 'paused' });
  });
  it('keeps Fault after Pause and Resume on A2', () => {
    let state = accepted(fresh(), { type: 'pause', lineId: 'A2' }, 10);
    expect(lineStatus(state, 'A2', 10).reason).toBe('fault');
    state = accepted(state, { type: 'resume', lineId: 'A2' }, 20);
    expect(lineStatus(state, 'A2', 20).reason).toBe('fault');
    expect(state.overlay.runTicks!('A2', 0, 100)).toBe(0);
  });
  it('has identical Alarm history for large and split advances with the same controls', () => {
    const run = (split: boolean) => {
      let state = fresh(); const tag = state.dataset.tags.find(t => t.id === 'E2-puller.puller-speed')!;
      state = accepted(state, { type: 'pause', lineId: 'E2' }, 0);
      state = accepted(state, { type: 'setpoint-override', tagId: tag.id, value: tag.max, reason: 'trial' }, 0);
      for (const tick of split ? [10, 40, 100] : [100]) state = accepted(state, { type: 'advance' }, tick);
      state = accepted(state, { type: 'resume', lineId: 'E2' }, 101);
      for (const tick of split ? [102, 120, 300, 1000] : [1000]) state = accepted(state, { type: 'advance' }, tick);
      return state.alarms;
    };
    expect(run(false)).toEqual(run(true));
  });
});


describe('validated version boundary', () => {
  it('accepts the structure of every generated version without changing the Mock Dataset', () => {
    for (const seed of [1, 2, 3, 20260101]) {
      const data = generateMockDataset(seed), before = snapshot(data);
      for (const version of data.recipeVersions) expect(validateVersion(version, data.recipes.find(r => r.id === version.recipeId)!.lineType).valid, `seed ${seed}, ${version.id}`).toBe(true);
      expect(snapshot(data)).toBe(before);
    }
  });
  it('refuses ambiguous keys, duplicate identities, disordered Steps and non-finite or unordered values', () => {
    const state = fresh(), version = draft(state);
    const invalid = (change: (v: typeof version) => void) => {
      const copy = structuredClone(version);
      change(copy);
      expect(validateVersion(copy, 'extrusion').valid).toBe(false);
    };
    invalid(v => { v.steps[1]!.parameters[0]!.key = v.steps[0]!.parameters[0]!.key; });
    invalid(v => { v.steps[1]!.id = v.steps[0]!.id; });
    invalid(v => { v.steps[1]!.parameters[0]!.id = v.steps[0]!.parameters[0]!.id; });
    invalid(v => { v.steps[0]!.order = 2; });
    invalid(v => { v.steps[0]!.parameters[0]!.setpoint = NaN; });
    invalid(v => { v.steps[0]!.parameters[0]!.min = Infinity; });
    invalid(v => { v.steps[0]!.parameters[0]!.max = -1; });
    const copy = structuredClone(version);
    copy.steps[1]!.parameters[0]!.key = copy.steps[0]!.parameters[0]!.key;
    expect(() => parametersByKey(copy)).toThrow('duplicate Parameter key');
  });
  it('copies a missing Step only from the latest Approved version of the same Recipe', () => {
    let state = fresh();
    const source = state.recipeVersions.find(v => v.status === 'approved' && v.steps.some(s => s.kind === 'cooldown') && !state.recipeVersions.some(x => x.recipeId === v.recipeId && x.status === 'draft'))!;
    state = accepted(state, { type: 'new-draft', versionId: source.id }, 1);
    const v = state.recipeVersions.find(v => v.recipeId === source.recipeId && v.status === 'draft')!;
    const step = v.steps.find(s => s.kind === 'cooldown')!;
    state = accepted(state, { type: 'remove-step', versionId: v.id, stepId: step.id }, 2);
    state = accepted(state, { type: 'approve', versionId: v.id }, 3);
    state = accepted(state, { type: 'new-draft', versionId: v.id }, 4);
    const next = state.recipeVersions.find(v => v.recipeId === source.recipeId && v.status === 'draft')!;
    expect(reduce(state, { type: 'add-step', versionId: next.id, kind: 'cooldown' }, { tick: 5 })).toMatchObject({ ok: false, error: { code: 'no-step-template' } });
  });
  it('preserves past stop reasons through Emergency stop and Reset, with an optional status tick', () => {
    let state = accepted(fresh(), { type: 'pause', lineId: 'E2' }, 10);
    state = accepted(state, { type: 'emergency-stop', lineId: 'E2', confirmed: true }, 20);
    state = accepted(state, { type: 'reset', lineId: 'E2' }, 30);
    expect(lineStatus(state, 'E2', 15).reason).toBe('paused');
    expect(lineStatus(state, 'E2', 25).reason).toBe('emergency-stop');
    expect(lineStatus(state, 'E2').reason).toBe('paused');
  });
});

for (const seed of [1, 2, 3, 20260101]) it(`seed ${seed}: Alarm history is independent of advance chunk size with changing controls`, () => {
  const d = generateMockDataset(seed), rng = createRng(seed);
  let whole = createPlantState(d), split = createPlantState(generateMockDataset(seed));
  let tick = 0;
  for (let step = 0; step < 30; step++) {
    tick += rng.int(10, 100);
    const lineId = rng.pick(d.lines).id, tag = rng.pick(d.tags.filter(t => t.writable));
    const action = rng.pick<PlantAction>([
      { type: 'pause', lineId }, { type: 'resume', lineId },
      { type: 'emergency-stop', lineId, confirmed: true }, { type: 'reset', lineId },
      { type: 'setpoint-override', tagId: tag.id, value: rng.pick([tag.min, tag.max]), reason: 'trial' },
      { type: 'reset-to-recipe', tagId: tag.id },
    ]);
    for (let t = split.syncedTick + 3; t < tick; t += 3) split = accepted(split, { type: 'advance' }, t);
    const a = reduce(whole, action, { tick }), b = reduce(split, action, { tick });
    expect(b.ok, `seed ${seed}, step ${step}, ${action.type}`).toBe(a.ok);
    if (a.ok) whole = a.state;
    if (b.ok) split = b.state;
    whole = accepted(whole, { type: 'advance' }, tick);
    split = accepted(split, { type: 'advance' }, tick);
    expect(split.alarms, `seed ${seed}, step ${step}, ${action.type}`).toEqual(whole.alarms);
  }
});

import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { simulatedTime } from '../sim/clock';
import { createPlantState, createPlantStore, reduce } from './index';
import type { PlantAction, PlantState } from './index';

const d = generateMockDataset();
const start = () => createPlantState(d);
const speed = d.tags.find((t) => t.id === 'E2-puller.puller-speed');
const mid = ((speed?.min ?? 0) + (speed?.max ?? 0)) / 2;
const cleanRecipe = d.recipes.find((r) => r.lineType === 'extrusion' && !d.recipeVersions.some((v) => v.recipeId === r.id && v.status === 'draft'))?.id ?? '';
const approvedOfClean = d.recipeVersions.filter((v) => v.recipeId === cleanRecipe).sort((a, b) => b.number - a.number)[0]?.id ?? '';
const unacked = d.alarms.find((a) => a.state === 'active-unacknowledged')?.id ?? '';

/** Every state-changing action with the entry it must write, in the order a session could do them. */
const script: { action: PlantAction; logs: string }[] = [
  { action: { type: 'pause', lineId: 'E2' }, logs: 'pause|line' },
  { action: { type: 'resume', lineId: 'E2' }, logs: 'resume|line' },
  { action: { type: 'emergency-stop', lineId: 'E2', confirmed: true }, logs: 'emergency-stop|line' },
  { action: { type: 'reset', lineId: 'E2' }, logs: 'reset|line' },
  { action: { type: 'resume', lineId: 'E2' }, logs: 'resume|line' },
  { action: { type: 'acknowledge', alarmIds: [unacked] }, logs: 'alarm-acknowledge|alarm' },
  { action: { type: 'setpoint-override', tagId: 'E2-puller.puller-speed', value: mid, reason: 'trial' }, logs: 'setpoint-override|tag' },
  { action: { type: 'reset-to-recipe', tagId: 'E2-puller.puller-speed' }, logs: 'reset-to-recipe|tag' },
  { action: { type: 'shift-handover', note: 'all normal' }, logs: 'shift-handover|shift' },
  { action: { type: 'new-draft', versionId: approvedOfClean }, logs: 'recipe-new-draft|recipe-version' },
  { action: { type: 'save-draft', versionId: `${cleanRecipe}-v${Number(/-v(\d+)$/.exec(approvedOfClean)?.[1]) + 1}` }, logs: 'recipe-save|recipe-version' },
  { action: { type: 'approve', versionId: `${cleanRecipe}-v${Number(/-v(\d+)$/.exec(approvedOfClean)?.[1]) + 1}` }, logs: 'recipe-approve|recipe-version' },
];

describe('the Event Log', () => {
  it('gets exactly one entry from every action that changes the state, of the right kind', () => {
    let s: PlantState = start();
    let tick = 100;
    // The new Draft is edited before it is saved, so the save has something to save.
    for (const { action, logs } of script) {
      if (action.type === 'save-draft') {
        const version = s.recipeVersions.find(v => v.id === action.versionId)!;
        const r = reduce(s, { type: 'reorder-step', versionId: version.id, stepId: version.steps[0]!.id, toIndex: 1 }, { tick });
        if (r.ok) s = r.state;
      }
      const r = reduce(s, action, { tick });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.events.map((e) => `${e.action}|${e.targetKind}`)).toEqual([logs]);
      expect(r.state.events).toHaveLength(s.events.length + 1);
      s = r.state;
      tick += 10;
    }
  });

  it('writes nothing for repeated Line actions, advance, set-user and an unchanged recipe setpoint', () => {
    const noops: PlantAction[] = [
      { type: 'resume', lineId: 'E2' },
      { type: 'reset', lineId: 'E2' },
      { type: 'advance' },
      { type: 'set-user', userId: d.users[3]?.id ?? '' },
      { type: 'reset-to-recipe', tagId: 'E2-puller.puller-speed' },
    ];
    for (const a of noops) expect(reduce(start(), a, { tick: 50 })).toMatchObject({ ok: true, events: [] });
  });

  it('numbers entries after the Mock Dataset ones, with unique ids, valid Users, the tick time, and rising times', () => {
    let s = start();
    let tick = 10;
    for (const { action } of script.slice(0, 9)) {
      const r = reduce(s, action, { tick });
      if (r.ok) s = r.state;
      tick += 5;
    }
    const added = s.events.slice(d.events.length);
    expect(added.length).toBeGreaterThan(5);
    expect(new Set(s.events.map((e) => e.id)).size).toBe(s.events.length);
    expect(added[0]?.id).toBe(`EV-${String(d.events.length + 1).padStart(4, '0')}`);
    for (const e of added) expect(d.users.some((u) => u.id === e.userId)).toBe(true);
    for (let i = 1; i < added.length; i++) expect((added[i]?.at ?? 0) >= (added[i - 1]?.at ?? 0)).toBe(true);
    expect(added[0]?.at).toBe(simulatedTime(10));
  });

  it('is the same for the same actions, every time', () => {
    const run = () => {
      let s = start();
      let tick = 5;
      for (const { action } of script) {
        const r = reduce(s, action, { tick });
        if (r.ok) s = r.state;
        tick += 7;
      }
      return JSON.stringify([s.events, s.alarms, s.recipeVersions, [...s.setpoints], [...s.handovers], s.controls]);
    };
    expect(run()).toBe(run());
  });
});

describe('the store', () => {
  it('holds the state, applies actions and tells listeners only about real changes', () => {
    const store = createPlantStore(d);
    const heard: number[] = [];
    const off = store.subscribe((s) => heard.push(s.events.length));
    expect(store.dispatch({ type: 'pause', lineId: 'E2' }, 10).ok).toBe(true);
    expect(store.dispatch({ type: 'pause', lineId: 'E2' }, 11).ok).toBe(true); // nothing to do
    expect(store.dispatch({ type: 'emergency-stop', lineId: 'E2', confirmed: false }, 12).ok).toBe(false);
    expect(heard).toEqual([d.events.length + 1]);
    expect(store.getState().controls.E2.paused).toBe(true);
    off();
    store.dispatch({ type: 'resume', lineId: 'E2' }, 20);
    expect(heard).toHaveLength(1);
  });

  it('starts again from the Mock Dataset on every load, because nothing is saved', () => {
    const first = createPlantStore(d);
    first.dispatch({ type: 'pause', lineId: 'E2' }, 10);
    const second = createPlantStore(d);
    expect(second.getState().controls.E2.paused).toBe(false);
    expect(second.getState().events).toHaveLength(d.events.length);
    expect(JSON.stringify(createPlantState(d).alarms)).toBe(JSON.stringify(d.alarms));
  });

  it('is available from the package entry', async () => {
    const core = await import('../index');
    for (const name of ['createPlantStore', 'createPlantState', 'reduce', 'lineStatus', 'recipeList', 'recipeCheck', 'checkRecipeVersion', 'isDirty']) {
      expect(typeof (core as Record<string, unknown>)[name]).toBe('function');
    }
  });
});

import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { simulatedTime } from '../sim/clock';
import { createPlantState, recipeCheck, recipeList, reduce } from './index';
import type { PlantAction, PlantState } from './index';

const d = generateMockDataset();
const start = () => createPlantState(d);

function ok(state: PlantState, action: PlantAction, tick = 10) {
  const r = reduce(state, action, { tick });
  if (!r.ok) throw new Error(`refused: ${r.error.code}`);
  return r;
}
const refused = (state: PlantState, action: PlantAction, tick = 10) => {
  const r = reduce(state, action, { tick });
  return r.ok ? null : r.error;
};
const hasDraft = (recipeId: string) => d.recipeVersions.some((v) => v.recipeId === recipeId && v.status === 'draft');
const latest = (s: PlantState, recipeId: string) => s.recipeVersions.filter((v) => v.recipeId === recipeId).sort((a, b) => b.number - a.number)[0];
const param = (s: PlantState, versionId: string, key: string) => s.recipeVersions.find((v) => v.id === versionId)?.steps.flatMap((x) => x.parameters).find((p) => p.key === key);
const failing = (s: PlantState, id: string) => recipeCheck(s, id)?.filter((r) => r.status === 'fail').map((r) => r.rule);

// Recipes picked from the data: an extrusion Recipe with no Draft, and the Drafts that are meant to fail.
const clean = d.recipes.find((r) => r.lineType === 'extrusion' && !hasDraft(r.id))?.id ?? '';
const draftOf = (rule: number) => d.recipeVersions.find((v) => v.status === 'draft' && failing(start(), v.id)?.includes(rule as 1))?.id ?? '';
const bad1 = draftOf(1);
const bad2 = draftOf(2);

describe('the Recipe library', () => {
  it('lists every Recipe with its latest version and status', () => {
    const list = recipeList(start());
    expect(list).toHaveLength(d.recipes.length);
    for (const row of list) {
      const l = latest(start(), row.recipeId);
      expect(row).toMatchObject({ latestNumber: l?.number, latestStatus: l?.status, latestVersionId: l?.id });
    }
    expect(list.some((r) => r.latestStatus === 'draft')).toBe(true);
  });
});

describe('New Draft', () => {
  const approved = () => latest(start(), clean);

  it('copies an Approved version into a new Draft, logs it, and leaves the Mock Dataset alone', () => {
    const src = approved();
    expect(src?.status).toBe('approved');
    const r = ok(start(), { type: 'new-draft', versionId: src?.id ?? '' }, 50);
    const draft = latest(r.state, clean);
    expect(draft).toMatchObject({ number: (src?.number ?? 0) + 1, status: 'draft', approvedAt: null, createdAt: simulatedTime(50), recipeId: clean });
    expect(draft?.id).not.toBe(src?.id);
    expect(draft?.steps.map((s) => s.parameters.map((p) => [p.key, p.setpoint, p.min, p.max]))).toEqual(src?.steps.map((s) => s.parameters.map((p) => [p.key, p.setpoint, p.min, p.max])));
    const ids = r.state.recipeVersions.flatMap((v) => [v.id, ...v.steps.flatMap((s) => [s.id, ...s.parameters.map((p) => p.id)])]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ action: 'recipe-new-draft', targetKind: 'recipe-version', target: draft?.id });
    expect(d.recipeVersions).toHaveLength(start().recipeVersions.length);
  });

  it('refuses a Recipe that already has a Draft, a version that is not Approved, and an unknown version', () => {
    expect(refused(start(), { type: 'new-draft', versionId: latest(start(), d.recipeVersions.find((v) => v.status === 'draft')?.recipeId ?? '')?.id ?? '' })?.code).toBe('not-approved');
    const withDraft = d.recipeVersions.find((v) => v.status === 'draft');
    const olderApproved = d.recipeVersions.find((v) => v.recipeId === withDraft?.recipeId && v.status === 'approved');
    expect(refused(start(), { type: 'new-draft', versionId: olderApproved?.id ?? '' })?.code).toBe('draft-exists');
    expect(refused(start(), { type: 'new-draft', versionId: 'R99-v1' })?.code).toBe('unknown-version');
  });
});

describe('editing a Draft', () => {
  const withDraft = () => ok(start(), { type: 'new-draft', versionId: latest(start(), clean)?.id ?? '' }).state;
  const draftId = () => latest(withDraft(), clean)?.id ?? '';

  /** Raises the maximum of barrel zone 3 and then its setpoint past the 195 limit, as an engineer would. */
  const overLimit = (s: PlantState) => {
    const p = param(s, draftId(), 'barrel-zone-3');
    const widened = ok(s, { type: 'edit-parameter', versionId: draftId(), parameterId: p?.id ?? '', field: 'max', value: 200 }, 20).state;
    return ok(widened, { type: 'edit-parameter', versionId: draftId(), parameterId: p?.id ?? '', field: 'setpoint', value: 198 }, 21);
  };

  it('changes a Parameter value and checks the rules again, without logging', () => {
    const s = withDraft();
    const r = overLimit(s);
    expect(param(r.state, draftId(), 'barrel-zone-3')?.setpoint).toBe(198);
    expect(r.events).toEqual([]);
    expect(failing(r.state, draftId())).toContain(1);
    expect(failing(s, draftId())).toEqual([]);
  });

  it('names the Parameter and the limit broken when a rule fails', () => {
    const rule = recipeCheck(overLimit(withDraft()).state, draftId())?.[0];
    expect(rule?.status).toBe('fail');
    expect(rule?.violations).toContainEqual({ parameterKeys: ['barrel-zone-3'], kind: 'above-max', limit: 195, actual: 198 });
  });

  it('refuses an edit that puts minimum, setpoint and maximum out of order, and names the Parameter', () => {
    const s = withDraft();
    const p = param(s, draftId(), 'screw-speed');
    for (const [field, value] of [['min', (p?.setpoint ?? 0) + 1], ['max', (p?.setpoint ?? 0) - 1], ['setpoint', (p?.max ?? 0) + 1]] as const) {
      const e = refused(s, { type: 'edit-parameter', versionId: draftId(), parameterId: p?.id ?? '', field, value });
      expect(e).toMatchObject({ code: 'parameter-order', parameterId: p?.id });
    }
    expect(refused(s, { type: 'edit-parameter', versionId: draftId(), parameterId: p?.id ?? '', field: 'setpoint', value: Number.NaN })?.code).toBe('invalid-value');
    expect(refused(s, { type: 'edit-parameter', versionId: draftId(), parameterId: 'nope', field: 'setpoint', value: 1 })?.code).toBe('unknown-parameter');
  });

  it('keeps an Approved version read-only', () => {
    const src = latest(start(), clean);
    const p = src?.steps[0]?.parameters[0];
    expect(refused(start(), { type: 'edit-parameter', versionId: src?.id ?? '', parameterId: p?.id ?? '', field: 'setpoint', value: p?.setpoint ?? 0 })?.code).toBe('read-only');
    expect(refused(start(), { type: 'add-step', versionId: src?.id ?? '', kind: 'cooldown' })?.code).toBe('read-only');
    expect(refused(start(), { type: 'discard-draft', versionId: src?.id ?? '' })?.code).toBe('read-only');
  });

  it('adds, removes and reorders Steps, keeping the order 1 to n and the ids unique', () => {
    const s = withDraft();
    const before = latest(s, clean)?.steps.length ?? 0;
    const added = ok(s, { type: 'add-step', versionId: draftId(), kind: 'cooldown' }).state;
    const v1 = latest(added, clean);
    expect(v1?.steps).toHaveLength(before + 1);
    expect(v1?.steps.map((x) => x.order)).toEqual(v1?.steps.map((_, i) => i + 1));
    expect(v1?.steps[before]?.kind).toBe('cooldown');
    expect(v1?.steps[before]?.parameters.length).toBeGreaterThan(0);

    const first = v1?.steps[0]?.id ?? '';
    const moved = ok(added, { type: 'reorder-step', versionId: draftId(), stepId: first, toIndex: before }).state;
    const v2 = latest(moved, clean);
    expect(v2?.steps[before]?.id).toBe(first);
    expect(v2?.steps.map((x) => x.order)).toEqual(v2?.steps.map((_, i) => i + 1));

    const removed = ok(moved, { type: 'remove-step', versionId: draftId(), stepId: first }).state;
    const v3 = latest(removed, clean);
    expect(v3?.steps).toHaveLength(before);
    expect(v3?.steps.map((x) => x.order)).toEqual(v3?.steps.map((_, i) => i + 1));
    const again = ok(removed, { type: 'add-step', versionId: draftId(), kind: 'ramp' }).state;
    const ids = latest(again, clean)?.steps.map((x) => x.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
    expect(refused(removed, { type: 'remove-step', versionId: draftId(), stepId: 'nope' })?.code).toBe('unknown-step');
  });
});

describe('Save, Approve and Discard', () => {
  it('blocks Save and Approve while a rule fails, naming the rule', () => {
    expect(bad1).not.toBe('');
    for (const type of ['save-draft', 'approve'] as const) {
      const e = refused(start(), { type, versionId: bad1 });
      expect(e).toMatchObject({ code: 'rules-failing', rules: [1] });
    }
    expect(refused(start(), { type: 'save-draft', versionId: bad2 })).toMatchObject({ code: 'rules-failing', rules: [2] });
  });

  it('saves a Draft once the rules pass, logs it, and does nothing for a Save with no change', () => {
    const p = param(start(), bad1, 'barrel-zone-3');
    const fixed = ok(start(), { type: 'edit-parameter', versionId: bad1, parameterId: p?.id ?? '', field: 'setpoint', value: 180 }).state;
    expect(failing(fixed, bad1)).toEqual([]);
    const saved = ok(fixed, { type: 'save-draft', versionId: bad1 }, 70);
    expect(saved.events).toHaveLength(1);
    expect(saved.events[0]).toMatchObject({ action: 'recipe-save', targetKind: 'recipe-version', target: bad1, at: simulatedTime(70) });
    expect(ok(saved.state, { type: 'save-draft', versionId: bad1 }, 80).events).toEqual([]);
  });

  it('approves a Draft with no failing rule: it becomes read-only and the Recipe can get a new Draft', () => {
    const p = param(start(), bad2, 'die-pressure');
    const fixed = ok(start(), { type: 'edit-parameter', versionId: bad2, parameterId: p?.id ?? '', field: 'setpoint', value: 160 }).state;
    const r = ok(fixed, { type: 'approve', versionId: bad2 }, 90);
    const v = r.state.recipeVersions.find((x) => x.id === bad2);
    expect(v).toMatchObject({ status: 'approved', approvedAt: simulatedTime(90) });
    expect(r.events[0]).toMatchObject({ action: 'recipe-approve', target: bad2, oldValue: 'draft', newValue: 'approved' });
    expect(refused(r.state, { type: 'edit-parameter', versionId: bad2, parameterId: p?.id ?? '', field: 'setpoint', value: 161 })?.code).toBe('read-only');
    expect(recipeList(r.state).find((x) => x.recipeId === v?.recipeId)?.latestStatus).toBe('approved');
    expect(reduce(r.state, { type: 'new-draft', versionId: bad2 }, { tick: 100 }).ok).toBe(true);
  });

  it('discards a Draft, logs it, and lets the Recipe start a new one', () => {
    const recipeId = d.recipeVersions.find((v) => v.id === bad1)?.recipeId ?? '';
    const r = ok(start(), { type: 'discard-draft', versionId: bad1 }, 60);
    expect(r.state.recipeVersions.some((v) => v.id === bad1)).toBe(false);
    expect(r.events[0]).toMatchObject({ action: 'recipe-discard', target: bad1 });
    expect(latest(r.state, recipeId)?.status).toBe('approved');
    expect(reduce(r.state, { type: 'new-draft', versionId: latest(r.state, recipeId)?.id ?? '' }, { tick: 70 }).ok).toBe(true);
  });

  it('writes one entry for New Draft, Save, Approve and Discard, and none for edits', () => {
    const r = ok(start(), { type: 'new-draft', versionId: latest(start(), clean)?.id ?? '' }, 5);
    const id = latest(r.state, clean)?.id ?? '';
    const e = ok(r.state, { type: 'add-step', versionId: id, kind: 'ramp' }, 6);
    expect(e.state.events).toHaveLength(d.events.length + 1);
    const s = ok(e.state, { type: 'save-draft', versionId: id }, 7);
    const a = ok(s.state, { type: 'approve', versionId: id }, 8);
    expect(a.state.events.slice(d.events.length).map((x) => x.action)).toEqual(['recipe-new-draft', 'recipe-save', 'recipe-approve']);
  });
});

import type { LineType, Parameter, RecipeVersion, Step } from '../mock/types';
import { validateVersion } from './validation';
import { simulatedTime } from '../sim/clock';
import { checkRecipeVersion, failingRules, type RuleResult } from './rules';
import type { ActionResult, PlantAction, PlantState } from './types';
import { commit, entry, nothing, refuse } from './util';

const versionOf = (state: PlantState, id: string) => state.recipeVersions.find((v) => v.id === id);

function lineTypeOf(state: PlantState, v: RecipeVersion): LineType {
  return (state.dataset.recipes.find((r) => r.id === v.recipeId) as { lineType: LineType }).lineType;
}

/** The four Dependency Rules for a version, checked on its current content. */
export function recipeCheck(state: PlantState, versionId: string): RuleResult[] | undefined {
  const v = versionOf(state, versionId);
  return v ? checkRecipeVersion(v, lineTypeOf(state, v)) : undefined;
}

export interface RecipeRow {
  recipeId: string;
  productId: string;
  lineType: LineType;
  latestNumber: number;
  latestStatus: 'draft' | 'approved';
  latestVersionId: string;
}

/** The Recipe library: every Recipe with its latest version number and status. */
export function recipeList(state: PlantState): RecipeRow[] {
  return state.dataset.recipes.map((r) => {
    const latest = state.recipeVersions.filter((v) => v.recipeId === r.id).sort((a, b) => b.number - a.number)[0] as RecipeVersion;
    return { recipeId: r.id, productId: r.productId, lineType: r.lineType, latestNumber: latest.number, latestStatus: latest.status, latestVersionId: latest.id };
  });
}

const renumber = (steps: readonly Step[]): Step[] => steps.map((s, i) => ({ ...s, order: i + 1 }));
const replace = (state: PlantState, v: RecipeVersion) => state.recipeVersions.map((x) => (x.id === v.id ? v : x));
export const isDirty = (state: PlantState, versionId: string): boolean => {
  const version = versionOf(state, versionId), saved = state.savedDrafts.get(versionId);
  return version?.status === 'draft' && (!saved || !sameContent(version, saved));
};
const sameContent = (a: RecipeVersion, b: RecipeVersion) => JSON.stringify(a.steps) === JSON.stringify(b.steps);

function copySteps(steps: readonly Step[], versionId: string): Step[] {
  return steps.map((s, i) => {
    const id = `${versionId}-s${i + 1}`;
    return { ...s, id, order: i + 1, parameters: s.parameters.map((p): Parameter => ({ ...p, id: `${id}-${p.key}` })) };
  });
}

export function recipeAction(state: PlantState, action: Extract<PlantAction, { versionId: string }>, tick: number): ActionResult {
  const v = versionOf(state, action.versionId);
  if (!v) return refuse('unknown-version');

  if (!validateVersion(v, lineTypeOf(state, v)).valid) return refuse('invalid-version');

  if (action.type === 'new-draft') {
    if (v.status !== 'approved') return refuse('not-approved');
    const siblings = state.recipeVersions.filter((x) => x.recipeId === v.recipeId);
    if (siblings.some((x) => x.status === 'draft')) return refuse('draft-exists');
    const number = (state.ids.versions[v.recipeId] ?? 0) + 1;
    const id = `${v.recipeId}-v${number}`;
    const draft: RecipeVersion = { id, recipeId: v.recipeId, number, status: 'draft', createdAt: simulatedTime(tick), approvedAt: null, steps: copySteps(v.steps, id) };
    if (!validateVersion(draft, lineTypeOf(state, draft)).valid) return refuse('invalid-version');
    return commit(state, { ids: { ...state.ids, versions: { ...state.ids.versions, [v.recipeId]: number }, steps: { ...state.ids.steps, [id]: draft.steps.length } }, recipeVersions: [...state.recipeVersions, draft], savedDrafts: new Map(state.savedDrafts).set(id, draft) }, [entry(state, tick, 'recipe-new-draft', id, 'recipe-version')]);
  }

  if (v.status !== 'draft') return refuse('read-only');

  switch (action.type) {
    case 'add-step': {
      if (v.steps.some(s => s.kind === action.kind)) return refuse('step-kind-exists');
      // Only Approved content is a trusted template for a new Step.
      const template = state.recipeVersions
        .filter((x) => x.recipeId === v.recipeId && x.status === 'approved')
        .sort((a, b) => b.number - a.number)[0]?.steps.find((s) => s.kind === action.kind);
      if (!template) return refuse('no-step-template');
      const suffix = (state.ids.steps[v.id] ?? 0) + 1;
      const id = `${v.id}-s${suffix}`;
      const step: Step = {
        id,
        order: v.steps.length + 1,
        kind: action.kind,
        name: { key: `step.${action.kind}` },
        parameters: (template?.parameters ?? []).map((p) => ({ ...p, id: `${id}-${p.key}` })),
      };
      return updateVersion(state, { ...v, steps: [...v.steps, step] }, { ...state.ids, steps: { ...state.ids.steps, [v.id]: suffix } });
    }
    case 'remove-step': {
      if (!v.steps.some((s) => s.id === action.stepId)) return refuse('unknown-step');
      return updateVersion(state, { ...v, steps: renumber(v.steps.filter((s) => s.id !== action.stepId)) });
    }
    case 'reorder-step': {
      const from = v.steps.findIndex((s) => s.id === action.stepId);
      if (from < 0) return refuse('unknown-step');
      if (!Number.isFinite(action.toIndex)) return refuse('invalid-value');
      const rest = v.steps.filter((s) => s.id !== action.stepId);
      const to = Math.min(Math.max(0, Math.trunc(action.toIndex)), rest.length);
      return updateVersion(state, { ...v, steps: renumber([...rest.slice(0, to), v.steps[from] as Step, ...rest.slice(to)]) });
    }
    case 'edit-parameter': {
      if (!Number.isFinite(action.value)) return refuse('invalid-value');
      const target = v.steps.flatMap((s) => s.parameters).find((p) => p.id === action.parameterId);
      if (!target) return refuse('unknown-parameter');
      const next = { ...target, [action.field]: action.value };
      if (next.min > next.setpoint || next.setpoint > next.max) return refuse('parameter-order', { parameterId: target.id });
      const steps = v.steps.map((s) => ({ ...s, parameters: s.parameters.map((p) => (p.id === target.id ? next : p)) }));
      return updateVersion(state, { ...v, steps });
    }
    case 'save-draft': {
      const checked = validateVersion(v, lineTypeOf(state, v));
      if (!checked.valid || v.steps.length === 0) return refuse('invalid-version');
      const failing = failingRules(checked.rules);
      if (failing.length > 0) return refuse('rules-failing', { rules: failing });
      const saved = state.savedDrafts.get(v.id);
      if (saved && sameContent(saved, v)) return nothing(state);
      return commit(state, { savedDrafts: new Map(state.savedDrafts).set(v.id, v) }, [entry(state, tick, 'recipe-save', v.id, 'recipe-version')]);
    }
    case 'approve': {
      const checked = validateVersion(v, lineTypeOf(state, v));
      if (!checked.valid || v.steps.length === 0) return refuse('invalid-version');
      const failing = failingRules(checked.rules);
      if (failing.length > 0) return refuse('rules-failing', { rules: failing });
      const approved: RecipeVersion = { ...v, status: 'approved', approvedAt: simulatedTime(tick) };
      const savedDrafts = new Map(state.savedDrafts);
      savedDrafts.delete(v.id);
      return commit(state, { recipeVersions: replace(state, approved), savedDrafts }, [entry(state, tick, 'recipe-approve', v.id, 'recipe-version', 'draft', 'approved')]);
    }
    case 'discard-draft': {
      const savedDrafts = new Map(state.savedDrafts);
      savedDrafts.delete(v.id);
      return commit(state, { recipeVersions: state.recipeVersions.filter((x) => x.id !== v.id), savedDrafts }, [entry(state, tick, 'recipe-discard', v.id, 'recipe-version')]);
    }
  }
}

function updateVersion(state: PlantState, version: RecipeVersion, ids = state.ids): ActionResult {
  if (!validateVersion(version, lineTypeOf(state, version)).valid) return refuse('invalid-version');
  return commit(state, { recipeVersions: replace(state, version), ids }, []);
}

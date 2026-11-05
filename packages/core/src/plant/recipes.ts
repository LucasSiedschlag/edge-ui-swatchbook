import type { LineType, Parameter, RecipeVersion, Step } from '../mock/types';
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

  if (action.type === 'new-draft') {
    if (v.status !== 'approved') return refuse('not-approved');
    const siblings = state.recipeVersions.filter((x) => x.recipeId === v.recipeId);
    if (siblings.some((x) => x.status === 'draft')) return refuse('draft-exists');
    const number = Math.max(...siblings.map((x) => x.number)) + 1;
    const id = `${v.recipeId}-v${number}`;
    const draft: RecipeVersion = { id, recipeId: v.recipeId, number, status: 'draft', createdAt: simulatedTime(tick), approvedAt: null, steps: copySteps(v.steps, id) };
    return commit(state, { recipeVersions: [...state.recipeVersions, draft], savedDrafts: new Map(state.savedDrafts).set(id, draft) }, [entry(state, tick, 'recipe-new-draft', id, 'recipe-version')]);
  }

  if (v.status !== 'draft') return refuse('read-only');

  switch (action.type) {
    case 'add-step': {
      // A new Step starts with the Parameters other versions of this Recipe give a Step of that kind.
      const template = state.recipeVersions
        .filter((x) => x.recipeId === v.recipeId)
        .sort((a, b) => b.number - a.number)
        .flatMap((x) => x.steps)
        .find((s) => s.kind === action.kind);
      const suffix = Math.max(0, ...v.steps.map((s) => Number(/-s(\d+)$/.exec(s.id)?.[1] ?? 0))) + 1;
      const id = `${v.id}-s${suffix}`;
      const step: Step = {
        id,
        order: v.steps.length + 1,
        kind: action.kind,
        name: { key: `step.${action.kind}` },
        parameters: (template?.parameters ?? []).map((p) => ({ ...p, id: `${id}-${p.key}` })),
      };
      return commit(state, { recipeVersions: replace(state, { ...v, steps: [...v.steps, step] }) }, []);
    }
    case 'remove-step': {
      if (!v.steps.some((s) => s.id === action.stepId)) return refuse('unknown-step');
      return commit(state, { recipeVersions: replace(state, { ...v, steps: renumber(v.steps.filter((s) => s.id !== action.stepId)) }) }, []);
    }
    case 'reorder-step': {
      const from = v.steps.findIndex((s) => s.id === action.stepId);
      if (from < 0) return refuse('unknown-step');
      const rest = v.steps.filter((s) => s.id !== action.stepId);
      const to = Math.min(Math.max(0, Math.trunc(action.toIndex)), rest.length);
      return commit(state, { recipeVersions: replace(state, { ...v, steps: renumber([...rest.slice(0, to), v.steps[from] as Step, ...rest.slice(to)]) }) }, []);
    }
    case 'edit-parameter': {
      if (!Number.isFinite(action.value)) return refuse('invalid-value');
      const target = v.steps.flatMap((s) => s.parameters).find((p) => p.id === action.parameterId);
      if (!target) return refuse('unknown-parameter');
      const next = { ...target, [action.field]: action.value };
      if (next.min > next.setpoint || next.setpoint > next.max) return refuse('parameter-order', { parameterId: target.id });
      const steps = v.steps.map((s) => ({ ...s, parameters: s.parameters.map((p) => (p.id === target.id ? next : p)) }));
      return commit(state, { recipeVersions: replace(state, { ...v, steps }) }, []);
    }
    case 'save-draft': {
      const failing = failingRules(checkRecipeVersion(v, lineTypeOf(state, v)));
      if (failing.length > 0) return refuse('rules-failing', { rules: failing });
      const saved = state.savedDrafts.get(v.id);
      if (saved && sameContent(saved, v)) return nothing(state);
      return commit(state, { savedDrafts: new Map(state.savedDrafts).set(v.id, v) }, [entry(state, tick, 'recipe-save', v.id, 'recipe-version')]);
    }
    case 'approve': {
      const failing = failingRules(checkRecipeVersion(v, lineTypeOf(state, v)));
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

import { normalizeFilters, type FilterInput } from './filters';
import type { LineType, TextRef, RecipeVersion, Step } from '../mock/types';
import { STEP_KINDS, type StepKind } from '../mock/types';
import { reduce, recipeList, recipeCheck } from '../plant';
import type { PlantState, PlantError, RecipeRow, RuleResult } from '../plant';

interface RecipeFilterValues {
  lineType?: LineType;
  /** Matches the status of the latest version. */
  status?: 'draft' | 'approved';
  /** Case-insensitive substring of the translated name, the Product code or the Recipe id. */
  search?: string;
}
export type RecipeFilters = FilterInput<RecipeFilterValues>;
export const RECIPE_DEFAULT_FILTERS: RecipeFilters = {};
export const RECIPE_DEFAULT_STEP_KIND: StepKind | null = null;
export const RECIPE_DEFAULT_SELECTION: string | null = null;

export interface RecipeLibraryRow extends RecipeRow {
  productCode: string;
  nameRef: TextRef;
}

/** The Recipe library (Screen 2), in dataset order. `text` turns a TextRef into the current language for the name search. */
export function recipeLibraryView(
  state: PlantState,
  input: RecipeFilters | null,
  text: (ref: TextRef) => string,
): { rows: RecipeLibraryRow[]; empty: boolean } {
  const filters = normalizeFilters<RecipeFilterValues>(input);
  const { recipes, products } = state.dataset;
  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  const codeById = new Map(products.map((p) => [p.id, p.code]));
  const needle = filters.search?.toLowerCase() ?? '';
  const rows: RecipeLibraryRow[] = [];
  for (const base of recipeList(state)) {
    if (filters.lineType && base.lineType !== filters.lineType) continue;
    if (filters.status && base.latestStatus !== filters.status) continue;
    const nameRef = recipeById.get(base.recipeId)!.name;
    const productCode = codeById.get(base.productId)!;
    if (needle && ![text(nameRef), productCode, base.recipeId].some((s) => s.toLowerCase().includes(needle))) continue;
    rows.push({ ...base, productCode, nameRef });
  }
  return { rows, empty: rows.length === 0 };
}


export interface RecipeVersionActions { newDraft: boolean; addStep: boolean; save: boolean; approve: boolean; discard: boolean }
export interface RecipeStepView extends Step {
  moveUp: { toIndex: number; reason: 'recipes.first-step' | 'recipes.approved-read-only' | null };
  moveDown: { toIndex: number; reason: 'recipes.last-step' | 'recipes.approved-read-only' | null };
}
export interface RecipeRuleView extends Omit<RuleResult, 'violations'> {
  violations: (RuleResult['violations'][number] & { parameters: TextRef[]; unit: string })[];
}
export type RecipeVersionView = {
  actions: RecipeVersionActions; addableStepKinds: StepKind[];
  version: RecipeVersion; versions: { id: string; number: number; status: RecipeVersion['status'] }[];
  nameRef: TextRef; product: PlantState['dataset']['products'][number]; lineType: LineType;
  steps: RecipeStepView[]; rules: RecipeRuleView[];
  readOnlyReason: 'recipes.approved-read-only' | null;
  /** Null includes an allowed Save no-op; otherwise the reducer's exact refusal and failing rule ids. */
  saveBlock: PlantError | null;
  approveBlock: PlantError | null;
  addStepReason: 'recipes.approved-read-only' | 'recipes.no-addable-step' | null;
  suggestedStepKind: StepKind | null;
  summary: 'recipes.approved-read-only' | 'recipes.draft-failing' | 'recipes.draft-passing';
} | { error: 'unknown-version' };

/** Probes use the same reducer and effective tick as dispatch; no action availability rule is duplicated here. */
export function recipeVersionView(state: PlantState, versionId: string): RecipeVersionView {
  const version = state.recipeVersions.find(v => v.id === versionId);
  if (!version) return { error: 'unknown-version' };
  const recipe = state.dataset.recipes.find(r => r.id === version.recipeId)!;
  const product = state.dataset.products.find(p => p.id === recipe.productId)!;
  const versions = state.recipeVersions.filter(v => v.recipeId === recipe.id).sort((a, b) => b.number - a.number);
  // Approved templates retain names and units even when a Draft removes a required Step.
  const parameters = new Map(versions.flatMap(v => v.steps.flatMap(s => s.parameters)).map(p => [p.key, p]));
  const rules = recipeCheck(state, versionId)!.map(rule => ({ ...rule, violations: rule.violations.map(violation => ({
    ...violation, parameters: violation.parameterKeys.map(key => parameters.get(key)?.name ?? { key: `parameter.${key}` }),
    unit: parameters.get(violation.parameterKeys[0]!)?.unit ?? '',
  })) }));
  const readOnlyReason = version.status === 'approved' ? 'recipes.approved-read-only' as const : null;
  const steps = version.steps.map<RecipeStepView>((step, index) => ({ ...step,
    moveUp: { toIndex: Math.max(0, index - 1), reason: readOnlyReason ?? (index === 0 ? 'recipes.first-step' as const : null) },
    moveDown: { toIndex: Math.min(version.steps.length - 1, index + 1), reason: readOnlyReason ?? (index === version.steps.length - 1 ? 'recipes.last-step' as const : null) },
  }));
  const ctx = { tick: state.lastTick };
  const available = (type: 'new-draft' | 'save-draft' | 'approve' | 'discard-draft') => {
    const r = reduce(state, { type, versionId }, ctx);
    return r.ok && r.events.length > 0;
  };
  const addableStepKinds = STEP_KINDS.filter(kind => reduce(state, { type: 'add-step', versionId, kind }, ctx).ok);
  const save = reduce(state, { type: 'save-draft', versionId }, ctx);
  const approve = reduce(state, { type: 'approve', versionId }, ctx);
  return { addStepReason: readOnlyReason ?? (addableStepKinds.length ? null : 'recipes.no-addable-step'), suggestedStepKind: addableStepKinds[0] ?? null, version, versions, nameRef: recipe.name, product, lineType: recipe.lineType, steps, rules, readOnlyReason,
    saveBlock: save.ok ? null : save.error, approveBlock: approve.ok ? null : approve.error,
    summary: readOnlyReason ?? (rules.some(rule => rule.status === 'fail') ? 'recipes.draft-failing' : 'recipes.draft-passing'), actions: {
    newDraft: available('new-draft'), addStep: addableStepKinds.length > 0,
    save: save.ok && save.events.length > 0, approve: approve.ok && approve.events.length > 0, discard: available('discard-draft'),
  }, addableStepKinds };
}

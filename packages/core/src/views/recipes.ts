import { normalizeFilters, type FilterInput } from './filters';
import type { LineType, TextRef } from '../mock/types';
import { recipeList } from '../plant';
import type { PlantState, RecipeRow } from '../plant';

interface RecipeFilterValues {
  lineType?: LineType;
  /** Matches the status of the latest version. */
  status?: 'draft' | 'approved';
  /** Case-insensitive substring of the translated name, the Product code or the Recipe id. */
  search?: string;
}
export type RecipeFilters = FilterInput<RecipeFilterValues>;

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

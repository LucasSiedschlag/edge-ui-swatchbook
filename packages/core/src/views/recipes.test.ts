import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import type { TextRef } from '../mock/types';
import { createPlantState, reduce } from '../plant';
import { recipeLibraryView } from './recipes';

const d = generateMockDataset();
const start = () => createPlantState(d);
const text = (r: TextRef) => `${r.key}|${JSON.stringify(r.params ?? {})}`;
const view = (f: Parameters<typeof recipeLibraryView>[1], s = start()) => recipeLibraryView(s, f, text);

describe('recipeLibraryView', () => {
  it('lists all 40 Recipes unfiltered, in dataset order, with ids and refs only', () => {
    const { rows, empty } = view({});
    expect(empty).toBe(false);
    expect(rows).toHaveLength(40);
    expect(rows.map((r) => r.recipeId)).toEqual(d.recipes.map((r) => r.id));
    for (const r of rows) {
      const recipe = d.recipes.find((x) => x.id === r.recipeId)!;
      expect(r.nameRef).toEqual(recipe.name);
      expect(r.productCode).toBe(d.products.find((p) => p.id === recipe.productId)!.code);
      expect(r.productCode.length).toBeGreaterThan(0);
      expect(r.latestVersionId).toMatch(new RegExp(`^${r.recipeId}`));
    }
  });

  it('filters by Line type', () => {
    const { rows } = view({ lineType: 'extrusion' });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(40);
    expect(rows).toHaveLength(d.recipes.filter((r) => r.lineType === 'extrusion').length);
    expect(rows.every((r) => r.lineType === 'extrusion')).toBe(true);
  });

  it('filters by latest status and a new Draft changes the result', () => {
    const s = start();
    const drafts = view({ status: 'draft' }, s).rows.length;
    expect(drafts + view({ status: 'approved' }, s).rows.length).toBe(40);
    const target = view({ status: 'approved' }, s).rows[0]!;
    const r = reduce(s, { type: 'new-draft', versionId: target.latestVersionId }, { tick: 5 });
    if (!r.ok) throw new Error(r.error.code);
    expect(view({ status: 'draft' }, r.state).rows).toHaveLength(drafts + 1);
    expect(view({ status: 'approved' }, r.state).rows.map((x) => x.recipeId)).not.toContain(target.recipeId);
    const row = view({}, r.state).rows.find((x) => x.recipeId === target.recipeId)!;
    expect(row.latestStatus).toBe('draft');
    expect(row.latestVersionId).not.toBe(target.latestVersionId);
  });

  it('searches name text, product code and recipe id, ignoring case', () => {
    const first = d.recipes[0]!;
    const code = d.products.find((p) => p.id === first.productId)!.code;
    expect(view({ search: code.toLowerCase() }).rows.map((r) => r.recipeId)).toContain(first.id);
    expect(view({ search: first.id.toUpperCase() }).rows.map((r) => r.recipeId)).toContain(first.id);
    const word = first.name.key.slice(2, 8).toUpperCase();
    const byName = view({ search: word }).rows;
    expect(byName.length).toBeGreaterThan(0);
    for (const r of byName) {
      const hay = [text(r.nameRef), r.productCode, r.recipeId].join(' ').toLowerCase();
      expect(hay).toContain(word.toLowerCase());
    }
  });

  it('uses the injected text function for the name match', () => {
    const upper = (r: TextRef) => 'ZZ-' + r.key;
    const { rows } = recipeLibraryView(start(), { search: 'zz-' }, upper);
    expect(rows).toHaveLength(40);
  });

  it('combines filters and reports the empty state', () => {
    const a = view({ lineType: 'assembly', status: 'approved' }).rows;
    expect(a.every((r) => r.lineType === 'assembly' && r.latestStatus === 'approved')).toBe(true);
    expect(view({ search: 'no-such-recipe-xyz' })).toEqual({ rows: [], empty: true });
    expect(view({ lineType: 'cnc', search: 'no-such-recipe-xyz' }).empty).toBe(true);
  });

  it('treats a blank search as no search and does not mutate the state', () => {
    const s = start();
    const before = JSON.stringify(s.recipeVersions);
    expect(view({ search: '   ' }, s).rows).toHaveLength(40);
    expect(JSON.stringify(s.recipeVersions)).toBe(before);
    expect(view({ search: 'a' }, s)).toEqual(view({ search: 'a' }, s));
  });
});

it('normalizes null and empty Recipe filters', () => {
  for (const value of [undefined, null, [], ''] as const) {
    expect(view({ lineType: value, status: value, search: value })).toEqual(view({}));
  }
  expect(view(null)).toEqual(view({}));
});

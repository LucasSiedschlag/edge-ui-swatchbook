import { describe, expect, it } from 'vitest';
import { generateMockDataset } from './generate';
import { DAY, HISTORY_DAYS, NOW } from './time';
import type { RecipeVersion } from './types';

const d = generateMockDataset();
const byRecipe = (id: string) => d.recipeVersions.filter((v) => v.recipeId === id);
const params = (v: RecipeVersion) => v.steps.flatMap((s) => s.parameters);
const sp = (v: RecipeVersion, key: string) => params(v).find((p) => p.key === key)?.setpoint;

// Test-local copies of Dependency Rules 1, 3 and 4. The real rules belong to Issue #3.
function rule1Fails(v: RecipeVersion) {
  const z = [1, 2, 3, 4, 5].map((n) => sp(v, `barrel-zone-${n}`));
  if (z.some((x) => x === undefined)) return false;
  const t = z as number[];
  return t.some((x) => x < 165 || x > 195) || t.some((x, i) => i > 0 && Math.abs(x - (t[i - 1] as number)) > 15);
}
function rule3Fails(v: RecipeVersion) {
  const t = sp(v, 'weld-temperature');
  const s = sp(v, 'weld-time');
  if (t === undefined || s === undefined) return false;
  return t < 240 || t > 270 || s < 20 || s > 40;
}
function rule4Fails(v: RecipeVersion) {
  const c = sp(v, 'cycle-time');
  return c !== undefined && c >= 120;
}

describe('products and recipes', () => {
  it('has 8 Products with unique codes', () => {
    expect(d.products).toHaveLength(8);
    expect(new Set(d.products.map((p) => p.code)).size).toBe(8);
  });

  it('has one Recipe per Product and Line type (40)', () => {
    expect(d.recipes).toHaveLength(40);
    const keys = new Set(d.recipes.map((r) => `${r.productId}|${r.lineType}`));
    expect(keys.size).toBe(40);
    expect(new Set(d.recipes.map((r) => r.lineType)).size).toBe(5);
    for (const r of d.recipes) expect(d.products.some((p) => p.id === r.productId)).toBe(true);
  });
});

describe('recipe versions', () => {
  it('numbers versions 1..n per Recipe and has at least one Approved', () => {
    for (const r of d.recipes) {
      const vs = byRecipe(r.id);
      expect(vs.map((v) => v.number)).toEqual(vs.map((_, i) => i + 1));
      expect(vs.some((v) => v.status === 'approved')).toBe(true);
    }
  });

  it('has at most one Draft per Recipe, and it is the latest version', () => {
    for (const r of d.recipes) {
      const vs = byRecipe(r.id);
      const drafts = vs.filter((v) => v.status === 'draft');
      expect(drafts.length).toBeLessThanOrEqual(1);
      if (drafts[0]) expect(drafts[0]).toBe(vs[vs.length - 1]);
    }
  });

  it('has both Draft and Approved versions overall', () => {
    expect(d.recipeVersions.some((v) => v.status === 'draft')).toBe(true);
    expect(d.recipeVersions.some((v) => v.status === 'approved')).toBe(true);
  });

  it('orders Steps from 1 and keeps min <= setpoint <= max', () => {
    for (const v of d.recipeVersions) {
      expect(v.steps.length).toBeGreaterThan(0);
      expect(v.steps.map((s) => s.order)).toEqual(v.steps.map((_, i) => i + 1));
      for (const p of params(v)) {
        expect(p.min).toBeLessThanOrEqual(p.setpoint);
        expect(p.setpoint).toBeLessThanOrEqual(p.max);
      }
    }
  });

  it('has unique ids for versions, steps and parameters', () => {
    const ids = (xs: { id: string }[]) => new Set(xs.map((x) => x.id)).size === xs.length;
    expect(ids(d.recipeVersions)).toBe(true);
    expect(ids(d.recipeVersions.flatMap((v) => v.steps))).toBe(true);
    expect(ids(d.recipeVersions.flatMap(params))).toBe(true);
  });
});

describe('recipe version history', () => {
  const windowStart = NOW - HISTORY_DAYS * DAY;

  it('dates every version, with an approval time only on Approved ones', () => {
    for (const v of d.recipeVersions) {
      expect(v.createdAt).toBeLessThan(NOW);
      if (v.status === 'approved') {
        expect(v.approvedAt).not.toBeNull();
        expect(v.approvedAt as number).toBeGreaterThan(v.createdAt);
        expect(v.approvedAt as number).toBeLessThan(NOW);
      } else {
        expect(v.approvedAt).toBeNull();
      }
    }
  });

  it('approves version 1 before the 90 day window', () => {
    for (const v of d.recipeVersions.filter((x) => x.number === 1)) expect(v.approvedAt as number).toBeLessThanOrEqual(windowStart);
  });

  it('creates each later version after the previous one was approved, inside the window', () => {
    for (const r of d.recipes) {
      const vs = d.recipeVersions.filter((v) => v.recipeId === r.id);
      for (let i = 1; i < vs.length; i++) {
        expect(vs[i]?.createdAt).toBeGreaterThan(vs[i - 1]?.approvedAt as number);
        expect(vs[i]?.createdAt).toBeGreaterThanOrEqual(windowStart);
      }
    }
  });
});

describe('dependency rules on generated data', () => {
  const approved = d.recipeVersions.filter((v) => v.status === 'approved');
  const drafts = d.recipeVersions.filter((v) => v.status === 'draft');

  it('every Approved version passes rules 1, 3 and 4 and die pressure stays under max', () => {
    for (const v of approved) {
      expect(rule1Fails(v)).toBe(false);
      expect(rule3Fails(v)).toBe(false);
      expect(rule4Fails(v)).toBe(false);
    }
  });

  it('has Drafts that fail rule 1, rule 3 and rule 4, and Drafts that pass', () => {
    expect(drafts.some(rule1Fails)).toBe(true);
    expect(drafts.some(rule3Fails)).toBe(true);
    expect(drafts.some(rule4Fails)).toBe(true);
    expect(drafts.some((v) => !rule1Fails(v) && !rule3Fails(v) && !rule4Fails(v))).toBe(true);
  });
});

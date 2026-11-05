import { describe, it, expect } from 'vitest';
import type { RecipeVersion } from '../mock/types';
import { generateMockDataset } from '../mock/generate';
import { checkRecipeVersion, diePressureLimit, failingRules } from './rules';

function version(values: Record<string, number>): RecipeVersion {
  return { id: 'v', recipeId: 'r', number: 1, status: 'draft', createdAt: 0, approvedAt: null,
    steps: Object.entries(values).map(([key, setpoint], order) => ({ id: key, order, kind: 'run', name: { key }, parameters: [{ id: key, key, name: { key }, setpoint, min: 0, max: 1000, unit: '' }] })) };
}

describe('dependency rules', () => {
  it('accepts inclusive barrel boundaries and adjacent difference', () => {
    expect(checkRecipeVersion(version({ 'barrel-zone-1': 165, 'barrel-zone-2': 180, 'barrel-zone-3': 195 }), 'extrusion').map(r => r.status)).toEqual(['pass', 'pass', 'not-applicable', 'not-applicable']);
  });
  it('reports barrel limits and adjacent differences', () => {
    expect(checkRecipeVersion(version({ 'barrel-zone-1': 164, 'barrel-zone-2': 196 }), 'extrusion')[0]!.violations).toEqual([
      { parameterKeys: ['barrel-zone-1'], kind: 'below-min', limit: 165, actual: 164 },
      { parameterKeys: ['barrel-zone-2'], kind: 'above-max', limit: 195, actual: 196 },
      { parameterKeys: ['barrel-zone-1', 'barrel-zone-2'], kind: 'adjacent-too-far', limit: 15, actual: 32 },
    ]);
  });
  it('checks die pressure and skips missing parameters', () => {
    expect(diePressureLimit(10)).toBe(190);
    expect(checkRecipeVersion(version({ 'die-pressure': 191, 'screw-speed': 10 }), 'extrusion')[1]).toEqual({ rule: 2, status: 'fail', violations: [{ parameterKeys: ['die-pressure', 'screw-speed'], kind: 'above-max', limit: 190, actual: 191 }] });
    expect(checkRecipeVersion(version({ 'die-pressure': 190, 'screw-speed': 10 }), 'extrusion')[1]!.status).toBe('pass');
    expect(checkRecipeVersion(version({ 'die-pressure': 999 }), 'extrusion')[1]!.status).toBe('pass');
  });
  it('checks weld and takt boundaries', () => {
    for (const [temperature, time] of [[240, 20], [270, 40]] as const) expect(checkRecipeVersion(version({ 'weld-temperature': temperature, 'weld-time': time, 'cycle-time': 119 }), 'assembly').map(r => r.status)).toEqual(['not-applicable', 'not-applicable', 'pass', 'pass']);
    const results = checkRecipeVersion(version({ 'weld-temperature': 239, 'weld-time': 41, 'cycle-time': 120 }), 'assembly');
    expect(results[2]!.violations).toEqual([{ parameterKeys: ['weld-temperature'], kind: 'below-min', limit: 240, actual: 239 }, { parameterKeys: ['weld-time'], kind: 'above-max', limit: 40, actual: 41 }]);
    expect(results[3]!.violations).toEqual([{ parameterKeys: ['cycle-time'], kind: 'above-max', limit: 120, actual: 120 }]);
    expect(failingRules(results)).toEqual([3, 4]);
    expect(checkRecipeVersion(version({ 'weld-temperature': 271, 'weld-time': 19 }), 'assembly')[2]!.violations).toEqual([{ parameterKeys: ['weld-temperature'], kind: 'above-max', limit: 270, actual: 271 }, { parameterKeys: ['weld-time'], kind: 'below-min', limit: 20, actual: 19 }]);
  });
  it('returns four ordered not applicable results for other lines', () => {
    for (const type of ['roll-forming', 'stamping', 'cnc'] as const) expect(checkRecipeVersion(version({}), type)).toEqual([1, 2, 3, 4].map(rule => ({ rule, status: 'not-applicable', violations: [] })));
  });
  it('checks generated approved and draft versions', () => {
    const data = generateMockDataset();
    const failures = data.recipeVersions.map(v => ({ v, rules: failingRules(checkRecipeVersion(v, data.recipes.find(r => r.id === v.recipeId)!.lineType)) }));
    expect(failures.filter(x => x.v.status === 'approved').every(x => x.rules.length === 0)).toBe(true);
    for (const rule of [1, 2, 3, 4]) expect(failures.some(x => x.v.status === 'draft' && x.rules.includes(rule as 1 | 2 | 3 | 4))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { generateMockDataset } from './generate';

const d = generateMockDataset();
const machine = new Map(d.machines.map((m) => [m.id, m]));

describe('tags', () => {
  it('has about 300 Tags and every Machine has at least 4', () => {
    expect(d.tags.length).toBeGreaterThanOrEqual(285);
    expect(d.tags.length).toBeLessThanOrEqual(315);
    for (const m of d.machines) expect(d.tags.filter((t) => t.machineId === m.id).length).toBeGreaterThanOrEqual(4);
  });

  it('has unique ids that name their Machine, and the Machine Line', () => {
    expect(new Set(d.tags.map((t) => t.id)).size).toBe(d.tags.length);
    for (const t of d.tags) {
      expect(t.id).toBe(`${t.machineId}.${t.name}`);
      expect(machine.get(t.machineId)?.lineId).toBe(t.lineId);
    }
  });

  it('keeps min <= setpoint <= max with a unit', () => {
    for (const t of d.tags) {
      expect(t.min).toBeLessThanOrEqual(t.setpoint);
      expect(t.setpoint).toBeLessThanOrEqual(t.max);
      expect(t.unit.length).toBeGreaterThan(0);
    }
  });

  it('has writable controls, read-only measurements and varied units', () => {
    expect(d.tags.some((t) => t.writable)).toBe(true);
    expect(d.tags.some((t) => !t.writable)).toBe(true);
    expect(new Set(d.tags.map((t) => t.unit)).size).toBeGreaterThanOrEqual(10);
  });

  it('only mirrors Recipe Parameter keys that exist', () => {
    const keys = new Set(d.recipeVersions.flatMap((v) => v.steps.flatMap((s) => s.parameters.map((p) => p.key))));
    const mirrored = d.tags.filter((t) => t.parameterKey !== null);
    expect(mirrored.length).toBeGreaterThan(0);
    for (const t of mirrored) expect(keys.has(t.parameterKey as string)).toBe(true);
  });

  it('keeps barrel zone, weld and cycle Tags inside the documented windows', () => {
    const window: Record<string, [number, number]> = {
      'barrel-zone-1': [165, 195], 'barrel-zone-2': [165, 195], 'barrel-zone-3': [165, 195],
      'barrel-zone-4': [165, 195], 'barrel-zone-5': [165, 195],
      'weld-temperature': [240, 270], 'weld-time': [20, 40], 'cycle-time': [0, 120],
    };
    for (const [key, [lo, hi]] of Object.entries(window)) {
      const tags = d.tags.filter((t) => t.parameterKey === key);
      expect(tags.length).toBeGreaterThan(0);
      for (const t of tags) {
        expect(t.min).toBeGreaterThanOrEqual(lo);
        expect(t.max).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('starts every recipe-linked Tag on a running Line at its active Recipe Version value', () => {
    const versions = new Map(d.recipeVersions.map((v) => [v.id, v]));
    let checked = 0;
    for (const b of d.activeBatches) {
      const params = new Map((versions.get(b.recipeVersionId)?.steps ?? []).flatMap((s) => s.parameters).map((p) => [p.key, p.setpoint]));
      for (const t of d.tags.filter((x) => x.lineId === b.lineId && x.parameterKey !== null && params.has(x.parameterKey))) {
        expect(t.setpoint).toBe(params.get(t.parameterKey as string));
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(20);
  });

  it('links coil-tension to its Recipe Parameter', () => {
    const coil = d.tags.filter((t) => t.name === 'coil-tension');
    expect(coil.length).toBeGreaterThan(0);
    for (const t of coil) expect(t.parameterKey).toBe('coil-tension');
  });
});

describe('tag setpoints and the normal drift', () => {
  // The Simulator drifts a Tag by up to 2 percent of its range. A seeded Setpoint Override must therefore leave at least
  // 3 percent of the range to each limit, or the Tag would leave its limits with no Alarm to explain it.
  it.each([1, 2, 3, 436, 20260101])('keeps every overridden Tag well inside its limits (seed %i)', (seed) => {
    const data = generateMockDataset(seed);
    const overridden = new Set(data.events.filter((e) => e.action === 'setpoint-override').map((e) => e.target));
    expect(overridden.size).toBeGreaterThan(0);
    for (const t of data.tags.filter((x) => overridden.has(x.id))) {
      const margin = (t.max - t.min) * 0.03;
      expect(t.setpoint).toBeGreaterThanOrEqual(t.min + margin);
      expect(t.setpoint).toBeLessThanOrEqual(t.max - margin);
    }
  });
});

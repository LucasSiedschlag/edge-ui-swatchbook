import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { raises } from './alarms';
import { simulate } from './simulate';

const TICKS = [0, 1, 59, 600, 601, 3600, 28_799, 28_800, 86_400];

/** Every Library calls simulate with its own copy of the dataset and must see the same numbers. */
describe.each([1, 2, 3, 20260101])('simulator for seed %i', (seed) => {
  const a = generateMockDataset(seed);
  const b = generateMockDataset(seed);

  it('gives identical snapshots from two separate datasets at the same tick', () => {
    for (const tick of TICKS) expect(JSON.stringify(simulate(a, tick))).toBe(JSON.stringify(simulate(b, tick)));
  });

  it('never produces NaN, negative counts, or a Stale Tag on an online Machine', () => {
    const online = new Set(a.machines.filter((m) => m.comms.status !== 'offline').map((m) => m.id));
    const tagMachine = new Map(a.tags.map((t) => [t.id, t.machineId]));
    for (const tick of TICKS) {
      const s = simulate(a, tick);
      for (const r of s.tags) {
        expect(Number.isFinite(r.value)).toBe(true);
        if (online.has(tagMachine.get(r.tagId) ?? '')) expect(r.status).not.toBe('stale');
      }
      for (const l of s.lines) {
        expect(l.outputThisShift).toBeGreaterThanOrEqual(0);
        expect(l.scrapThisShift).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(l.oee)).toBe(true);
      }
    }
  });

  it('lists the same raises from separate datasets', () => {
    expect(JSON.stringify(raises(a, 0, 7200))).toBe(JSON.stringify(raises(b, 0, 7200)));
  });
});

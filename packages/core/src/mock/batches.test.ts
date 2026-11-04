import { describe, expect, it } from 'vitest';
import { generateMockDataset } from './generate';
import { DAY, NOW, shiftAt } from './time';

const d = generateMockDataset();
const batchById = new Map([...d.batches, ...d.activeBatches].map((b) => [b.id, b]));
const lotById = new Map(d.lots.map((l) => [l.id, l]));
const genById = new Map(d.genealogies.map((g) => [g.lotId, g]));
const lineType = (id: string) => d.lines.find((l) => l.id === id)?.type;

describe('batches', () => {
  it('has about 5,000 Batches with unique ids, sorted by start', () => {
    expect(d.batches).toHaveLength(5000);
    expect(new Set(d.batches.map((b) => b.id)).size).toBe(5000);
    for (let i = 1; i < d.batches.length; i++) {
      expect((d.batches[i]?.start ?? 0) >= (d.batches[i - 1]?.start ?? 0)).toBe(true);
    }
  });

  it('references an Approved Recipe Version that fits the Line type and Product', () => {
    const versions = new Map(d.recipeVersions.map((v) => [v.id, v]));
    const recipes = new Map(d.recipes.map((r) => [r.id, r]));
    for (const b of d.batches) {
      const v = versions.get(b.recipeVersionId);
      expect(v?.status).toBe('approved');
      const r = recipes.get(v?.recipeId ?? '');
      expect(r?.lineType).toBe(lineType(b.lineId));
      expect(r?.productId).toBe(b.productId);
    }
  });

  it('only uses a Recipe Version that was already approved when the Batch started', () => {
    const versions = new Map(d.recipeVersions.map((v) => [v.id, v]));
    for (const b of [...d.batches, ...d.activeBatches]) expect(versions.get(b.recipeVersionId)?.approvedAt as number).toBeLessThanOrEqual(b.start);
  });

  it('uses later Recipe Versions for later Batches', () => {
    const versions = new Map(d.recipeVersions.map((v) => [v.id, v]));
    const used = new Set(d.batches.map((b) => versions.get(b.recipeVersionId)?.number));
    expect([...used].some((n) => (n ?? 0) >= 2)).toBe(true);
  });

  it('stays inside the 90 day window, with start < end and the right Shift', () => {
    for (const b of d.batches) {
      expect(b.start).toBeGreaterThanOrEqual(NOW - 90 * DAY);
      expect(b.end).toBeLessThanOrEqual(NOW);
      expect(b.start).toBeLessThan(b.end);
      expect(b.shift).toBe(shiftAt(b.start));
    }
  });

  it('never overlaps two Batches on the same Line', () => {
    const last = new Map<string, number>();
    for (const b of d.batches) {
      expect(b.start).toBeGreaterThanOrEqual(last.get(b.lineId) ?? 0);
      last.set(b.lineId, b.end);
    }
  });

  it('has all three statuses, mostly completed, with sane yield and scrap', () => {
    const s = (x: string) => d.batches.filter((b) => b.status === x).length;
    expect(s('aborted')).toBeGreaterThan(0);
    expect(s('rework')).toBeGreaterThan(0);
    expect(s('completed')).toBeGreaterThan(4000);
    for (const b of d.batches) {
      expect(b.yieldPct).toBeGreaterThanOrEqual(0);
      expect(b.yieldPct).toBeLessThanOrEqual(100);
      expect(Number.isInteger(b.scrap)).toBe(true);
      expect(b.scrap).toBeGreaterThanOrEqual(0);
    }
  });

  it('records an actual for every run or process Parameter, near its setpoint', () => {
    const versions = new Map(d.recipeVersions.map((v) => [v.id, v]));
    for (const b of d.batches.slice(0, 500)) {
      const ps = (versions.get(b.recipeVersionId)?.steps ?? [])
        .filter((s) => s.kind === 'run' || s.kind === 'process')
        .flatMap((s) => s.parameters);
      expect(Object.keys(b.actuals).sort()).toEqual(ps.map((p) => p.key).sort());
      for (const p of ps) expect(Math.abs((b.actuals[p.key] ?? NaN) - p.setpoint)).toBeLessThanOrEqual(Math.abs(p.setpoint) * 0.03 + 0.1);
    }
  });
});

describe('units', () => {
  it('gives every Batch a target and a produced count, with scrap inside produced', () => {
    for (const b of d.batches) {
      expect(b.targetUnits).toBeGreaterThan(0);
      expect(b.producedUnits).toBeGreaterThan(0);
      expect(b.producedUnits).toBeLessThanOrEqual(b.targetUnits);
      expect(b.scrap).toBeLessThanOrEqual(b.producedUnits);
    }
  });
});

describe('active batches', () => {
  const idle = 'C1';

  it('has one running Batch on every Line except the idle one', () => {
    expect(d.activeBatches.map((b) => b.lineId).sort()).toEqual(d.lines.map((l) => l.id).filter((l) => l !== idle).sort());
  });

  it('has started before NOW, ends after NOW, and is part-way to target', () => {
    for (const b of d.activeBatches) {
      expect(b.start).toBeLessThan(NOW);
      expect(b.plannedEnd).toBeGreaterThan(NOW);
      expect(b.producedUnits).toBeGreaterThan(0);
      expect(b.producedUnits).toBeLessThan(b.targetUnits);
      expect(b.shift).toBe(shiftAt(b.start));
    }
  });

  it('uses an Approved Recipe Version that fits the Line type and Product', () => {
    const versions = new Map(d.recipeVersions.map((v) => [v.id, v]));
    const recipes = new Map(d.recipes.map((r) => [r.id, r]));
    for (const b of d.activeBatches) {
      const v = versions.get(b.recipeVersionId);
      expect(v?.status).toBe('approved');
      expect(recipes.get(v?.recipeId ?? '')?.lineType).toBe(lineType(b.lineId));
      expect(recipes.get(v?.recipeId ?? '')?.productId).toBe(b.productId);
    }
  });

  it('starts after the last finished Batch on its Line, and the idle Line has been idle for more than a Shift', () => {
    for (const b of d.activeBatches) {
      const last = Math.max(...d.batches.filter((x) => x.lineId === b.lineId).map((x) => x.end));
      expect(last).toBeLessThanOrEqual(b.start);
    }
    const lastIdle = Math.max(...d.batches.filter((x) => x.lineId === idle).map((x) => x.end));
    expect(NOW - lastIdle).toBeGreaterThan(8 * 60 * 60_000);
  });

  it('counts scrap inside the units made so far', () => {
    for (const b of d.activeBatches) {
      expect(Number.isInteger(b.scrapUnits)).toBe(true);
      expect(b.scrapUnits).toBeGreaterThanOrEqual(0);
      expect(b.scrapUnits).toBeLessThanOrEqual(b.producedUnits);
    }
  });

  it('keeps ids unique across finished and running Batches', () => {
    expect(new Set([...d.batches, ...d.activeBatches].map((b) => b.id)).size).toBe(5000 + d.activeBatches.length);
  });
});

describe('lots and genealogy', () => {
  it('has one Lot per Batch, linked both ways', () => {
    expect(d.lots).toHaveLength(5000 + d.activeBatches.length);
    for (const b of [...d.batches, ...d.activeBatches]) expect(lotById.get(b.lotId)?.batchId).toBe(b.id);
    expect(lotById.size).toBe(d.lots.length);
  });

  it('has one Genealogy per Lot', () => {
    expect(d.genealogies).toHaveLength(d.lots.length);
    for (const l of d.lots) expect(genById.has(l.id)).toBe(true);
  });

  it('only names Batches that exist and whose Lot matches', () => {
    for (const g of d.genealogies) {
      for (const n of [g.materialLot, g.extrusion, g.metalwork, g.assembly]) {
        if (n?.batchId) expect(batchById.get(n.batchId)?.lotId).toBe(n.lotId);
      }
    }
  });

  it('builds the chain by Line type', () => {
    for (const b of [...d.batches, ...d.activeBatches]) {
      const g = genById.get(b.lotId);
      const t = lineType(b.lineId);
      if (t === 'extrusion') {
        expect(g?.extrusion?.batchId).toBe(b.id);
        expect(g?.assembly).toBeNull();
        expect(lotById.get(b.lotId)?.upstreamLotId).toBe(g?.materialLot?.lotId);
      } else if (t === 'assembly') {
        expect(g?.assembly?.batchId).toBe(b.id);
        expect(g?.assembly?.serial).toMatch(/^SN-/);
        expect(g?.extrusion).not.toBeNull();
        expect(g?.metalwork).not.toBeNull();
        expect(lotById.get(b.lotId)?.upstreamLotId).toBe(g?.extrusion?.lotId);
      } else {
        expect(g?.metalwork?.batchId).toBe(b.id);
        expect(g?.extrusion).toBeNull();
      }
    }
  });

  it('only links an Assembly Batch to upstream Batches that ended before it started', () => {
    for (const b of [...d.batches, ...d.activeBatches].filter((x) => lineType(x.lineId) === 'assembly')) {
      const g = genById.get(b.lotId);
      for (const n of [g?.extrusion, g?.metalwork]) {
        const up = n?.batchId ? d.batches.find((x) => x.id === n.batchId) : undefined;
        if (up) expect(up.end).toBeLessThanOrEqual(b.start);
      }
    }
  });

  it('only links an Assembly Batch to upstream Batches that make the same Product', () => {
    for (const b of [...d.batches, ...d.activeBatches].filter((x) => lineType(x.lineId) === 'assembly')) {
      const g = genById.get(b.lotId);
      for (const n of [g?.extrusion, g?.metalwork]) {
        if (n?.batchId) expect(batchById.get(n.batchId)?.productId).toBe(b.productId);
      }
    }
  });
});

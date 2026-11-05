import type { Rng } from './prng';
import { DAY, HISTORY_DAYS, MINUTE, NOW, shiftAt } from './time';
import type {
  ActiveBatch, Batch, BatchStatus, Genealogy, GenealogyNode, Line, LineId, Lot, Recipe, RecipeVersion,
} from './types';

export interface BatchSection {
  batches: Batch[];
  activeBatches: ActiveBatch[];
  lots: Lot[];
  genealogies: Genealogy[];
}

/** Batches per Line (total 5,000) and duration range in minutes. Durations keep each Line 65 to 80 percent busy. */
const PLAN: Record<LineId, { count: number; minMin: number; maxMin: number }> = {
  E1: { count: 700, minMin: 90, maxMin: 180 },
  E2: { count: 700, minMin: 90, maxMin: 180 },
  RF1: { count: 500, minMin: 150, maxMin: 270 },
  P1: { count: 400, minMin: 150, maxMin: 270 },
  C1: { count: 400, minMin: 150, maxMin: 270 },
  A1: { count: 1150, minMin: 60, maxMin: 110 },
  A2: { count: 1150, minMin: 60, maxMin: 110 },
};

/** Ideal units per minute by Line type. Assembly is the 120 s takt. */
export const IDEAL_UNITS_PER_MIN: Record<string, number> = { extrusion: 3, 'roll-forming': 2.5, stamping: 4, cnc: 2, assembly: 0.5 };

/** The one Line with no running Batch at NOW, so the Deck empty state exists. */
export const IDLE_LINE: LineId = 'C1';

const WINDOW_START = NOW - HISTORY_DAYS * DAY;
const pad = (n: number, w: number) => String(n).padStart(w, '0');
const SCALE = [1, 10, 100];
const round = (x: number, dp: 0 | 1 | 2) => Math.round(x * (SCALE[dp] as number)) / (SCALE[dp] as number);

function pickStatus(rng: Rng): BatchStatus {
  const r = rng.next();
  return r < 0.04 ? 'aborted' : r < 0.1 ? 'rework' : 'completed';
}

function yieldFor(status: BatchStatus, rng: Rng): number {
  if (status === 'completed') return round(rng.float(94, 99.6), 1);
  if (status === 'rework') return round(rng.float(85, 94), 1);
  return round(rng.float(20, 70), 1);
}

/** Index of the last batch in `list` (sorted by end) that ended at or before `t`, or -1. */
function lastEndedBefore(list: Batch[], t: number): number {
  let lo = 0;
  let hi = list.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((list[mid] as Batch).end <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** A recent completed upstream Batch from a pool of one Product, or null when none ended in time. */
function pickUpstream(pool: Batch[] | undefined, t: number, rng: Rng): Batch | null {
  if (!pool) return null;
  let i = lastEndedBefore(pool, t);
  if (i < 0) return null;
  i -= rng.int(0, Math.min(i, 10));
  for (; i >= 0; i--) if ((pool[i] as Batch).status === 'completed') return pool[i] as Batch;
  return null;
}

function poolsByProduct(list: Batch[]): Map<string, Batch[]> {
  const out = new Map<string, Batch[]>();
  for (const b of [...list].sort((x, y) => x.end - y.end)) out.set(b.productId, [...(out.get(b.productId) ?? []), b]);
  return out;
}

export function generateBatches(rng: Rng, lines: Line[], recipes: Recipe[], versions: RecipeVersion[]): BatchSection {
  const approvedByRecipe = new Map<string, RecipeVersion[]>();
  for (const v of versions) {
    if (v.status !== 'approved') continue;
    approvedByRecipe.set(v.recipeId, [...(approvedByRecipe.get(v.recipeId) ?? []), v]);
  }
  // A Batch can only run a Recipe Version that was already approved when it started.
  const pickRecipe = (type: Line['type'], start: number) => {
    const recipe = rng.pick(recipes.filter((r) => r.lineType === type));
    const eligible = (approvedByRecipe.get(recipe.id) ?? []).filter((v) => (v.approvedAt as number) <= start);
    return { recipe, version: rng.pick(eligible) };
  };

  const lots: Lot[] = [];
  const genByLot = new Map<string, Genealogy>();
  const byLine = new Map<LineId, Batch[]>();
  const activeByLine = new Map<LineId, ActiveBatch>();
  const materialOf = (prefix: string, start: number, daysPerLot: number) =>
    `ML-${prefix}-${pad(Math.floor((start - WINDOW_START) / (daysPerLot * DAY)) + 1, 3)}`;

  // Extrusion and metalworking first, Assembly last, so Assembly can name finished upstream Batches.
  const order = [...lines].sort((a, b) => (a.type === 'assembly' ? 1 : 0) - (b.type === 'assembly' ? 1 : 0));

  // Pass 1: times, recipes, status, units and actuals for every Batch on a Line.
  for (const line of order) {
    const plan = PLAN[line.id];
    const rate = IDEAL_UNITS_PER_MIN[line.type] as number;
    const running = line.id !== IDLE_LINE;

    // The running Batch is placed first because it fixes where the finished ones must stop.
    let finishedBy = NOW - rng.int(9 * 60, 11 * 60) * MINUTE;
    if (running) {
      const durMin = rng.int(plan.minMin, plan.maxMin);
      const elapsedMin = rng.int(20, Math.min(80, durMin - 10));
      const start = NOW - elapsedMin * MINUTE;
      const { recipe, version } = pickRecipe(line.type, start);
      const targetUnits = Math.round(durMin * rate);
      const seq = pad(plan.count + 1, 5);
      const producedUnits = Math.max(1, Math.round(targetUnits * (elapsedMin / durMin) * 0.95));
      activeByLine.set(line.id, {
        id: `B-${line.id}-${seq}`,
        lineId: line.id,
        productId: recipe.productId,
        recipeVersionId: version.id,
        lotId: `LOT-${line.id}-${seq}`,
        shift: shiftAt(start),
        start,
        plannedEnd: start + durMin * MINUTE,
        targetUnits,
        producedUnits,
        scrapUnits: Math.round(producedUnits * rng.float(0.01, 0.04)),
      });
      finishedBy = start - rng.int(5, 30) * MINUTE;
    }

    const durations = Array.from({ length: plan.count }, () => rng.int(plan.minMin, plan.maxMin) * MINUTE);
    const gaps = Array.from({ length: plan.count + 1 }, () => rng.next());
    const slack = finishedBy - WINDOW_START - durations.reduce((a, b) => a + b, 0);
    if (slack <= 0) throw new Error(`Line ${line.id} cannot fit its Batches`);
    const scale = slack / gaps.reduce((a, b) => a + b, 0);

    const list: Batch[] = [];
    let cursor = WINDOW_START;
    for (let i = 0; i < plan.count; i++) {
      const start = Math.round(cursor + (gaps[i] as number) * scale);
      const end = start + (durations[i] as number);
      cursor = end;

      const { recipe, version } = pickRecipe(line.type, start);
      const status = pickStatus(rng);
      const yieldPct = yieldFor(status, rng);
      const targetUnits = Math.round(((durations[i] as number) / MINUTE) * rate);
      const producedUnits = Math.max(1, Math.round(targetUnits * (status === 'aborted' ? rng.float(0.2, 0.7) : rng.float(0.88, 1))));
      const actuals: Record<string, number> = {};
      for (const s of version.steps) {
        if (s.kind !== 'run' && s.kind !== 'process') continue;
        for (const p of s.parameters) actuals[p.key] = round(p.setpoint * (1 + rng.float(-0.015, 0.015)), 2);
      }
      const seq = pad(i + 1, 5);
      list.push({
        id: `B-${line.id}-${seq}`,
        lineId: line.id,
        productId: recipe.productId,
        recipeVersionId: version.id,
        lotId: `LOT-${line.id}-${seq}`,
        shift: shiftAt(start),
        start,
        end,
        status,
        targetUnits,
        producedUnits,
        yieldPct,
        scrap: Math.round((producedUnits * (100 - yieldPct)) / 100),
        actuals,
      });
    }
    byLine.set(line.id, list);
  }

  const node = (b: Batch | null, fallbackLot: string): GenealogyNode => ({ lotId: b?.lotId ?? fallbackLot, batchId: b?.id ?? null });
  const extrusionPools = poolsByProduct([...(byLine.get('E1') ?? []), ...(byLine.get('E2') ?? [])]);
  const metalPools = poolsByProduct([...(byLine.get('RF1') ?? []), ...(byLine.get('P1') ?? []), ...(byLine.get('C1') ?? [])]);

  // Pass 2: Lots and Genealogy for finished and running Batches. Upstream chains are built before Assembly.
  for (const line of order) {
    const members: { id: string; lotId: string; start: number; productId: string }[] = [...(byLine.get(line.id) ?? [])];
    const active = activeByLine.get(line.id);
    if (active) members.push(active);
    for (const b of members) {
      if (line.type === 'assembly') {
        const ext = pickUpstream(extrusionPools.get(b.productId), b.start, rng);
        const met = pickUpstream(metalPools.get(b.productId), b.start, rng);
        const extLot = ext?.lotId ?? `LOT-E1-PRE-${pad(rng.int(1, 99), 3)}`;
        const metLot = met?.lotId ?? `LOT-RF1-PRE-${pad(rng.int(1, 99), 3)}`;
        const extChain = ext ? genByLot.get(ext.lotId) : undefined;
        genByLot.set(b.lotId, {
          lotId: b.lotId,
          materialLot: extChain?.materialLot ?? { lotId: materialOf('PVC', b.start, 2), batchId: null },
          extrusion: node(ext, extLot),
          metalwork: node(met, metLot),
          assembly: { lotId: b.lotId, batchId: b.id, serial: `SN-${line.id}-${pad(Number(b.id.slice(-5)), 6)}` },
        });
        lots.push({ id: b.lotId, batchId: b.id, upstreamLotId: extLot });
      } else {
        const isExtrusion = line.type === 'extrusion';
        const material: GenealogyNode = { lotId: materialOf(isExtrusion ? 'PVC' : 'STL', b.start, isExtrusion ? 2 : 3), batchId: null };
        const own: GenealogyNode = { lotId: b.lotId, batchId: b.id };
        genByLot.set(b.lotId, {
          lotId: b.lotId,
          materialLot: material,
          extrusion: isExtrusion ? own : null,
          metalwork: isExtrusion ? null : own,
          assembly: null,
        });
        lots.push({ id: b.lotId, batchId: b.id, upstreamLotId: material.lotId });
      }
    }
  }

  const batches = [...byLine.values()].flat().sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    batches,
    activeBatches: [...activeByLine.values()],
    lots,
    genealogies: lots.map((l) => genByLot.get(l.id) as Genealogy),
  };
}

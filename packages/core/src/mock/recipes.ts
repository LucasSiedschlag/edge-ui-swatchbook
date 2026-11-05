import type { Rng } from './prng';
import { DAY, HISTORY_DAYS, HOUR, NOW } from './time';
import type { LineType, Parameter, Product, Recipe, RecipeVersion, Step, StepKind } from './types';

// Parameter ranges are design suggestions, not verified production values.
// Sourced: rigid PVC barrel 165-195 C, weld window 240-270 C for 20-40 s, takt 120 s.

export const PRODUCTS: Product[] = [
  ['WIN-1L-60', 'window-1-leaf'],
  ['WIN-2L-70', 'window-2-leaf'],
  ['WIN-TT-70', 'window-tilt-turn'],
  ['WIN-FX-60', 'window-fixed'],
  ['DOR-1L-80', 'door-1-leaf'],
  ['DOR-2L-80', 'door-2-leaf'],
  ['DOR-SL-80', 'door-sliding'],
  ['WIN-PG-70', 'window-bay'],
].map(([code, slug], i) => ({
  id: `PR${i + 1}`,
  code: code as string,
  name: { key: `product.${slug}`, params: { code: code as string } },
}));

const LINE_TYPES: LineType[] = ['extrusion', 'roll-forming', 'stamping', 'cnc', 'assembly'];

interface ParamSpec { key: string; unit: string; setpoint: number; min: number; max: number }
interface StepSpec { kind: StepKind; params: ParamSpec[] }

const p = (key: string, unit: string, setpoint: number, min: number, max: number): ParamSpec => ({ key, unit, setpoint, min, max });

/** Barrel zones ramp up 5 C per zone from a base of 170-176 C. */
function extrusionSteps(rng: Rng): StepSpec[] {
  const base = rng.int(170, 176);
  const zones = [0, 1, 2, 3, 4].map((i) => p(`barrel-zone-${i + 1}`, '°C', base + i * 4 + rng.int(-1, 1), 165, 195));
  return [
    { kind: 'preheat', params: [p('barrel-preheat', '°C', 150, 120, 165)] },
    { kind: 'ramp', params: [p('ramp-rate', '°C/min', 3, 1, 6)] },
    {
      kind: 'run',
      params: [
        ...zones,
        p('screw-speed', 'rpm', rng.int(18, 26), 10, 35),
        p('die-pressure', 'bar', rng.int(160, 200), 120, 250),
        p('puller-speed', 'm/min', Math.round(rng.float(1.2, 2.2) * 10) / 10, 0.5, 3),
      ],
    },
    { kind: 'cooldown', params: [p('cooldown-temperature', '°C', 80, 40, 120)] },
  ];
}

function stepsFor(lineType: LineType, rng: Rng): StepSpec[] {
  switch (lineType) {
    case 'extrusion':
      return extrusionSteps(rng);
    case 'roll-forming':
      return [
        { kind: 'load', params: [p('coil-tension', 'kN', 12, 6, 20)] },
        { kind: 'run', params: [p('line-speed', 'm/min', rng.int(20, 30), 10, 40), p('forming-pressure', 'bar', rng.int(70, 90), 50, 120)] },
      ];
    case 'stamping':
      return [
        { kind: 'load', params: [p('die-clamp-force', 'kN', 40, 20, 80)] },
        { kind: 'run', params: [p('press-force', 'kN', rng.int(110, 140), 80, 180), p('stroke-rate', 'spm', rng.int(35, 45), 20, 60)] },
      ];
    case 'cnc':
      return [
        { kind: 'load', params: [p('tool-offset', 'mm', 0, -2, 2)] },
        { kind: 'run', params: [p('spindle-speed', 'rpm', rng.int(7000, 9000), 3000, 12000), p('feed-rate', 'mm/min', rng.int(1500, 2100), 800, 3000)] },
      ];
    case 'assembly':
      return [
        { kind: 'load', params: [p('load-time', 's', 8, 4, 15)] },
        {
          kind: 'process',
          params: [
            p('weld-temperature', '°C', rng.int(250, 260), 240, 270),
            p('weld-time', 's', rng.int(26, 34), 20, 40),
            p('cycle-time', 's', rng.int(100, 112), 60, 119),
          ],
        },
        { kind: 'inspect', params: [p('vision-threshold', '%', 92, 80, 99)] },
      ];
  }
}

export interface RecipeSection {
  recipes: Recipe[];
  recipeVersions: RecipeVersion[];
}

function buildVersion(recipeId: string, number: number, status: 'draft' | 'approved', specs: StepSpec[], createdAt: number, approvedAt: number | null): RecipeVersion {
  const id = `${recipeId}-v${number}`;
  const steps: Step[] = specs.map((s, i) => ({
    id: `${id}-s${i + 1}`,
    order: i + 1,
    kind: s.kind,
    name: { key: `step.${s.kind}` },
    parameters: s.params.map((q): Parameter => ({
      id: `${id}-s${i + 1}-${q.key}`,
      key: q.key,
      name: { key: `parameter.${q.key}` },
      setpoint: q.setpoint,
      min: q.min,
      max: q.max,
      unit: q.unit,
    })),
  }));
  return { id, recipeId, number, status, createdAt, approvedAt, steps };
}

/** Sets a Parameter setpoint in a Step spec list, widening the range if needed. */
function breakParam(specs: StepSpec[], key: string, value: number): StepSpec[] {
  return specs.map((s) => ({
    ...s,
    params: s.params.map((q) => (q.key === key ? { ...q, setpoint: value, max: Math.max(q.max, value + 10) } : q)),
  }));
}

/** Recipe id -> the Parameter to push out of its Dependency Rule window. */
const BROKEN_DRAFTS: Record<string, { key: string; value: number }> = {
  R01: { key: 'barrel-zone-3', value: 198 }, // rule 1, extrusion, PR1
  R05: { key: 'weld-temperature', value: 275 }, // rule 3, assembly, PR1
  R10: { key: 'cycle-time', value: 126 }, // rule 4, assembly, PR2
  R06: { key: 'die-pressure', value: 255 }, // rule 2, extrusion, PR2: above the limit at any screw speed from 18 to 26 rpm
};

export function generateRecipes(rng: Rng): RecipeSection {
  const windowStart = NOW - HISTORY_DAYS * DAY;
  const recipes: Recipe[] = [];
  const recipeVersions: RecipeVersion[] = [];
  let n = 0;
  for (const product of PRODUCTS) {
    for (const lineType of LINE_TYPES) {
      n++;
      const id = `R${String(n).padStart(2, '0')}`;
      recipes.push({ id, productId: product.id, lineType, name: { key: `recipe.${lineType}`, params: { product: product.code } } });
      const base = stepsFor(lineType, rng);
      const approvedCount = rng.int(1, 3);
      // Version 1 was approved before the window. Each later one is created after the previous was approved.
      const v1Approved = windowStart - rng.int(DAY, 30 * DAY);
      recipeVersions.push(buildVersion(id, 1, 'approved', base, v1Approved - rng.int(DAY, 5 * DAY), v1Approved));
      let prevApproved = v1Approved;
      for (let v = 2; v <= approvedCount; v++) {
        const created = (v === 2 ? windowStart : prevApproved) + rng.int(v === 2 ? DAY : 2 * DAY, 20 * DAY);
        prevApproved = created + rng.int(2 * HOUR, 48 * HOUR);
        recipeVersions.push(buildVersion(id, v, 'approved', base, created, prevApproved));
      }
      // Drafts exist for every 3rd Recipe plus four deliberately broken ones, so Screen 2 has failing rules to show.
      const broken = BROKEN_DRAFTS[id];
      if (broken || n % 3 === 0) {
        const draft = broken ? breakParam(base, broken.key, broken.value) : base;
        const created = (approvedCount === 1 ? windowStart : prevApproved) + rng.int(approvedCount === 1 ? DAY : 2 * DAY, 20 * DAY);
        recipeVersions.push(buildVersion(id, approvedCount + 1, 'draft', draft, created, null));
      }
    }
  }
  return { recipes, recipeVersions };
}

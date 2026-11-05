import type { LineId, MockDataset } from '../mock/types';
import { contextOf } from '../sim/context';
import type { Overlay } from '../sim/overlay';
import type { LineControl, PlantState, StopSpan } from './types';

const NEVER = Number.POSITIVE_INFINITY;

/** Ticks of [from, to) that fall inside none of the spans. Overlapping spans count once. */
export function runTicksOf(spans: readonly StopSpan[], from: number, to: number): number {
  if (to <= from) return 0;
  const clipped = spans
    .map((s) => ({ a: Math.max(s.fromTick, from), b: Math.min(s.toTick, to) }))
    .filter((s) => s.b > s.a)
    .sort((x, y) => x.a - y.a);
  let stopped = 0;
  let end = -NEVER;
  for (const s of clipped) {
    const a = Math.max(s.a, end);
    if (s.b > a) stopped += s.b - a;
    end = Math.max(end, s.b);
  }
  return to - from - stopped;
}

/** The Overlay the Simulator reads. It captures the spans as they are now, so it must be rebuilt when they change. */
export function buildOverlay(
  manualStops: Readonly<Record<LineId, readonly StopSpan[]>>,
  faultStops: Readonly<Record<LineId, readonly StopSpan[]>>,
  setpoints?: Overlay['setpoints'],
): Overlay {
  return {
    ...(setpoints ? { setpoints } : {}),
    runTicks: (lineId, from, to) => runTicksOf([...(faultStops[lineId] ?? []), ...(manualStops[lineId] ?? [])], from, to),
  };
}

/** The state at load. Plant State resets on reload, so this is the only way to get one. */
export function createPlantState(d: MockDataset): PlantState {
  const controls = {} as Record<LineId, LineControl>;
  const manualStops = {} as Record<LineId, readonly StopSpan[]>;
  const faultStops = {} as Record<LineId, readonly StopSpan[]>;
  for (const line of d.lines) {
    controls[line.id] = { paused: false, latched: false };
    manualStops[line.id] = [];
    faultStops[line.id] = [];
  }
  // A Machine that is Offline stops its Line for Fault, from its last heartbeat on.
  const heartbeat = contextOf(d).heartbeat;
  for (const m of d.machines) {
    const tick = heartbeat.get(m.id);
    if (tick !== undefined) faultStops[m.lineId] = [...(faultStops[m.lineId] ?? []), { fromTick: tick, toTick: NEVER }];
  }
  const firstOperator = d.users.find((u) => u.role === 'operator') ?? (d.users[0] as { id: string });
  return {
    dataset: d,
    currentUserId: firstOperator.id,
    controls,
    manualStops,
    faultStops,
    recipeVersions: d.recipeVersions,
    savedDrafts: new Map(d.recipeVersions.filter((v) => v.status === 'draft').map((v) => [v.id, v])),
    setpoints: new Map(),
    handovers: new Map(),
    syncedTick: 0,
    alarms: d.alarms.map((a) => ({ ...a })),
    events: d.events.map((e) => ({ ...e })),
    overlay: buildOverlay(manualStops, faultStops),
  };
}

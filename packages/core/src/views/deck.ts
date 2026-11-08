import type { LineId } from '../mock/types';
import { lineStatus, reduce, type PlantAction, type LineStatus, type PlantState } from '../plant';
import { assertSessionTick } from '../sim/context';
import type { BatchProgress, LineLive } from '../sim/kpis';
import type { Snapshot } from '../sim/simulate';
import { criticalBannerView } from './banner';

export interface DeckLine extends LineStatus { id: LineId }
export interface DeckSelected { id: LineId; status: LineStatus['status']; stopReason: LineStatus['reason']; criticalAlarms: number }
export interface DeckBatch extends BatchProgress { productCode: string; recipeVersion: number; start: number }
export type DeckKpis = Pick<LineLive, 'oee' | 'availability' | 'performance' | 'quality' | 'outputThisShift' | 'scrapThisShift' | 'cycle' | 'lineSpeed'> & {
  /** Applicability comes from Line type, even when no product is being made. */
  kind: 'cycle' | 'lineSpeed';
};
export interface DeckShift { id: Snapshot['shift']['shift']; startsAt: number; endsAt: number; remainingMs: number }
export interface DeckActions { pause: boolean; resume: boolean; emergencyStop: boolean; reset: boolean; shiftHandover: boolean }
export interface DeckView {
  actions: DeckActions;
  lines: DeckLine[];
  selected: DeckSelected;
  batch: DeckBatch | null;
  emptyBatch: boolean;
  kpis: DeckKpis;
  banner: ReturnType<typeof criticalBannerView>;
  shift: DeckShift;
}

// Keep the last effective tick per Line. Plant State is immutable, so another state cannot reuse these flags.
const actionCache = new WeakMap<PlantState, Map<LineId, { tick: number; actions: Readonly<DeckActions> }>>();

function actionsAt(state: PlantState, lineId: LineId, tick: number): Readonly<DeckActions> {
  let byLine = actionCache.get(state);
  if (!byLine) actionCache.set(state, (byLine = new Map()));
  const known = byLine.get(lineId);
  if (known?.tick === tick) return known.actions;
  const available = (action: PlantAction): boolean => {
    const result = reduce(state, action, { tick });
    return result.ok && result.events.length > 0;
  };
  const actions = Object.freeze({
    pause: available({ type: 'pause', lineId }), resume: available({ type: 'resume', lineId }),
    emergencyStop: available({ type: 'emergency-stop', lineId, confirmed: true }), reset: available({ type: 'reset', lineId }),
    shiftHandover: true,
  });
  byLine.set(lineId, { tick, actions });
  return actions;
}

/** Snapshot values are authoritative for progress, KPIs and Shift. Line status comes from Plant State. */
export function deckView(state: PlantState, snapshot: Snapshot, lineId: LineId, tick: number): DeckView {
  assertSessionTick(tick);
  tick = Math.max(tick, state.lastTick);
  if (snapshot.tick !== tick) throw new Error(`snapshot tick must match effective tick ${tick}`);
  if (snapshot.overlay !== state.overlay) throw new Error('snapshot overlay must match Plant State');
  const d = state.dataset;
  const line = d.lines.find(l => l.id === lineId);
  if (!line) throw new Error(`unknown line ${lineId}`);
  const live = snapshot.lines.find(l => l.lineId === lineId);
  if (!live) throw new Error(`snapshot missing line ${lineId}`);
  const lines = d.lines.map(l => ({ id: l.id, ...lineStatus(state, l.id, tick) }));
  const selected = lines.find(l => l.id === lineId)!;
  const active = live.batch ? d.activeBatches.find(b => b.id === live.batch!.batchId) : undefined;
  if (live.batch && !active) throw new Error(`unknown active batch ${live.batch.batchId}`);
  const batch = live.batch && active ? {
    ...live.batch, productCode: d.products.find(p => p.id === active.productId)!.code,
    // Active Batches use session versions; finished Ledger history uses Mock Dataset versions.
    recipeVersion: state.recipeVersions.find(v => v.id === active.recipeVersionId)!.number, start: active.start,
  } : null;
  return {
    actions: actionsAt(state, lineId, tick),
    lines, selected: { id: lineId, status: selected.status, stopReason: selected.reason, criticalAlarms: selected.criticalAlarms },
    batch, emptyBatch: batch === null,
    kpis: { kind: line.type === 'assembly' ? 'cycle' : 'lineSpeed', oee: live.oee, availability: live.availability, performance: live.performance, quality: live.quality,
      outputThisShift: live.outputThisShift, scrapThisShift: live.scrapThisShift, cycle: live.cycle, lineSpeed: live.lineSpeed },
    banner: criticalBannerView(state, tick, lineId),
    shift: { id: snapshot.shift.shift, startsAt: snapshot.shift.startsAt, endsAt: snapshot.shift.endsAt, remainingMs: snapshot.shift.remainingMs },
  };
}

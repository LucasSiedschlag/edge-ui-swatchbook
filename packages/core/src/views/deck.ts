import type { LineId } from '../mock/types';
import { lineStatus, reduce, type PlantAction, type LineStatus, type PlantState } from '../plant';
import { assertSessionTick } from '../sim/context';
import type { BatchProgress, LineLive } from '../sim/kpis';
import type { Snapshot } from '../sim/simulate';
import { criticalBannerView } from './banner';

export interface DeckLine extends LineStatus { id: LineId }
export interface DeckSelected { id: LineId; status: LineStatus['status']; stopReason: LineStatus['reason']; criticalAlarms: number }
export interface DeckBatch extends BatchProgress { productCode: string; recipeVersion: number; start: number }
export type DeckKpis = Pick<LineLive, 'oee' | 'availability' | 'performance' | 'quality' | 'outputThisShift' | 'scrapThisShift' | 'cycle' | 'lineSpeed'>;
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

/** Snapshot values are authoritative for progress, KPIs and Shift. Line status comes from Plant State. */
export function deckView(state: PlantState, snapshot: Snapshot, lineId: LineId, tick: number): DeckView {
  assertSessionTick(tick);
  const d = state.dataset;
  if (!d.lines.some(l => l.id === lineId)) throw new Error(`unknown line ${lineId}`);
  const live = snapshot.lines.find(l => l.lineId === lineId);
  if (!live) throw new Error(`snapshot missing line ${lineId}`);
  const lines = d.lines.map(l => ({ id: l.id, ...lineStatus(state, l.id, tick) }));
  const selected = lines.find(l => l.id === lineId)!;
  const active = live.batch ? d.activeBatches.find(b => b.id === live.batch!.batchId) : undefined;
  if (live.batch && !active) throw new Error(`unknown active batch ${live.batch.batchId}`);
  const batch = live.batch && active ? {
    ...live.batch, productCode: d.products.find(p => p.id === active.productId)!.code,
    recipeVersion: state.recipeVersions.find(v => v.id === active.recipeVersionId)!.number, start: active.start,
  } : null;
  const available = (action: PlantAction): boolean => {
    const result = reduce(state, action, { tick });
    return result.ok && result.events.length > 0;
  };
  return {
    actions: {
      pause: available({ type: 'pause', lineId }), resume: available({ type: 'resume', lineId }),
      emergencyStop: available({ type: 'emergency-stop', lineId, confirmed: true }), reset: available({ type: 'reset', lineId }),
      shiftHandover: true,
    },
    lines, selected: { id: lineId, status: selected.status, stopReason: selected.reason, criticalAlarms: selected.criticalAlarms },
    batch, emptyBatch: batch === null,
    kpis: { oee: live.oee, availability: live.availability, performance: live.performance, quality: live.quality,
      outputThisShift: live.outputThisShift, scrapThisShift: live.scrapThisShift, cycle: live.cycle, lineSpeed: live.lineSpeed },
    banner: criticalBannerView(state, tick, lineId),
    shift: { id: snapshot.shift.shift, startsAt: snapshot.shift.startsAt, endsAt: snapshot.shift.endsAt, remainingMs: snapshot.shift.remainingMs },
  };
}

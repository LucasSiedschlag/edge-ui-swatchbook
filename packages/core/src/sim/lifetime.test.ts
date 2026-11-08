import { expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { alarmList, createPlantState, reduce } from '../plant';
import type { PlantAction } from '../plant';
import { batchDetail } from '../views/ledger';
import { raiseAt } from './alarms';
import { simulate } from './simulate';

it('owns the delayed E2 Alarm through actual completion, independent of query order', () => {
  const d = generateMockDataset();
  let state = createPlantState(d);
  const apply = (action: PlantAction, tick: number) => {
    const r = reduce(state, action, { tick });
    if (!r.ok) throw new Error(r.error.code);
    state = r.state;
  };
  apply({ type: 'pause', lineId: 'E2' }, 0);
  apply({ type: 'resume', lineId: 'E2' }, 8000);
  apply({ type: 'setpoint-override', tagId: 'E2-extruder.barrel-zone-1-temp', value: 195, reason: 'test' }, 8001);
  const alarm = alarmList(state, 8001).find(a => a.tagId === 'E2-extruder.barrel-zone-1-temp' && a.raisedAt === d.now + 8001000)!;
  expect(alarm).toBeDefined();
  expect(alarm.batchId).toBe('B-E2-00701');
  const detail = batchDetail(state, 8001, 'B-E2-00701');
  if ('error' in detail) throw new Error(detail.error);
  expect(detail.alarms.map(a => a.id)).toContain(alarm.id);
  let lo = 8001, hi = 30000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (simulate(d, mid, state.overlay).lines.find(l => l.lineId === 'E2')!.batch!.complete) hi = mid;
    else lo = mid + 1;
  }
  const tag = d.tags.find(t => t.id === alarm.tagId)!;
  expect(raiseAt(d, tag, lo - 1, 'high', state.overlay).batchId).toBe(alarm.batchId);
  expect(raiseAt(d, tag, lo, 'high', state.overlay).batchId).toBeNull();
  expect(raiseAt(d, tag, lo + 1, 'high', state.overlay).batchId).toBeNull();
  const completed = batchDetail(state, lo, alarm.batchId!);
  if ('error' in completed) throw new Error(completed.error);
  expect(completed.header).toMatchObject({ status: 'completed', end: d.now + lo * 1000 });
  expect(batchDetail(state, 8001, alarm.batchId!)).toEqual(detail);
});

it('protects the shared Batch model from caller mutation', async () => {
  const { batchModel } = await import('./kpis');
  const d = generateMockDataset();
  const batch = d.activeBatches.find(b => b.lineId === 'E2')!;
  const model = batchModel(d, batch, {});
  expect(Object.isFrozen(model)).toBe(true);
  expect(() => Object.defineProperty(model, 'unitsAt', { value: () => -1 })).toThrow();
});

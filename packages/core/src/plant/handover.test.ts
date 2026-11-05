import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { simulatedTime } from '../sim/clock';
import { createPlantState, reduce } from './index';
import type { PlantAction, PlantState } from './index';

const d = generateMockDataset();
const start = () => createPlantState(d);

function ok(state: PlantState, action: PlantAction, tick: number) {
  const r = reduce(state, action, { tick });
  if (!r.ok) throw new Error(`refused: ${r.error.code}`);
  return r;
}

describe('Shift handover', () => {
  it('records the note on the current Shift, by the current User, and logs one entry', () => {
    const r = ok(start(), { type: 'shift-handover', note: 'Die change planned for E1' }, 3600);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({
      action: 'shift-handover', targetKind: 'shift', target: '2026-01-01/S1', oldValue: 'S1', newValue: 'S2',
      note: 'Die change planned for E1', at: simulatedTime(3600), userId: start().currentUserId,
    });
    expect(r.state.handovers.get('2026-01-01/S1')).toEqual([{ at: simulatedTime(3600), userId: start().currentUserId, note: 'Die change planned for E1' }]);
  });

  it('keeps every note of a Shift in order, and names the right Shift later in the session', () => {
    const a = ok(start(), { type: 'shift-handover', note: 'first' }, 100);
    const b = ok(a.state, { type: 'shift-handover', note: 'second' }, 200);
    expect(b.state.handovers.get('2026-01-01/S1')?.map((h) => h.note)).toEqual(['first', 'second']);
    const c = ok(b.state, { type: 'shift-handover', note: 'night' }, 8 * 3600 + 5);
    expect(c.events[0]).toMatchObject({ target: '2026-01-01/S2', oldValue: 'S2', newValue: 'S3' });
    expect(c.state.handovers.get('2026-01-01/S2')).toHaveLength(1);
  });

  it('hands S3 over to S1 of the next day', () => {
    const r = ok(start(), { type: 'shift-handover', note: 'end of night' }, 16 * 3600 + 10);
    expect(r.events[0]).toMatchObject({ target: '2026-01-01/S3', oldValue: 'S3', newValue: 'S1' });
  });

  it('needs a note', () => {
    for (const note of ['', '   ']) {
      const r = reduce(start(), { type: 'shift-handover', note }, { tick: 10 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('note-required');
    }
  });

  it('leaves the state it was given alone', () => {
    const before = start();
    ok(before, { type: 'shift-handover', note: 'x' }, 10);
    expect(before.handovers.size).toBe(0);
    expect(before.events).toHaveLength(d.events.length);
  });
});

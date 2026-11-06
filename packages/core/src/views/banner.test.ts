import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { createPlantState, lineStatus } from '../plant';
import { alarmListView } from './alarms';
import { criticalBannerView } from './banner';

const d = generateMockDataset();
const s = createPlantState(d);

describe('criticalBannerView', () => {
  it('shows one Critical Alarm on E1 at tick 0 and is expandable', () => {
    const v = criticalBannerView(s, 0, 'E1');
    expect(v.count).toBe(1);
    expect(v.expandable).toBe(true);
    expect(v.rows).toHaveLength(1);
    const row = v.rows[0]!;
    expect(row.alarmId).toMatch(/\S/);
    expect(row.ageSeconds).toBeGreaterThanOrEqual(0);
    expect(row.message.key).toMatch(/\S/);
  });

  it('is not expandable with zero Critical Alarms', () => {
    const quiet = d.lines.find((l) => lineStatus(s, l.id, 0).criticalAlarms === 0)!;
    expect(criticalBannerView(s, 0, quiet.id)).toEqual({ count: 0, expandable: false, rows: [] });
  });

  it('agrees with the Alarm list and the Line status on every Line', () => {
    for (const line of d.lines) {
      for (const tick of [0, 400]) {
        const v = criticalBannerView(s, tick, line.id);
        const list = alarmListView(s, tick, { lineId: line.id, priorities: ['critical'], states: ['active-unacknowledged', 'active-acknowledged'] }).rows;
        expect(v.rows.map((r) => r.alarmId)).toEqual(list.map((r) => r.id));
        expect(v.rows.map((r) => r.ageSeconds)).toEqual(list.map((r) => r.ageSeconds));
        expect(v.rows.map((r) => r.machineId)).toEqual(list.map((r) => r.machineId));
        expect(v.count).toBe(lineStatus(s, line.id, tick).criticalAlarms);
        expect(v.expandable).toBe(v.count > 0);
        expect(v.rows).toHaveLength(v.count);
      }
    }
  });
});

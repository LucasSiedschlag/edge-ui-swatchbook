import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { HOUR } from '../mock/time';
import { shiftsFromHours } from '../mock/history';
import { performanceView } from '../views/performance';
import { connectivityView } from '../views/tags';
import { readHours } from './kpis';
import { simulate } from './simulate';

const d = generateMockDataset();
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const round3 = (x: number) => Math.round(x * 1000) / 1000;

describe('hourly production agreement', () => {
  it('uses hourly run and planned minutes for availability once blending ends', () => {
    for (const tick of [1800, 3600, 10000, 28799, 30600, 40000]) {
      const snapshot = simulate(d, tick);
      const start = snapshot.shift.startsAt;
      for (const line of snapshot.lines) {
        const hours = snapshot.hours.filter((h) => h.lineId === line.lineId && h.hourStart >= start);
        expect(line.availability, `${line.lineId}/${tick}`).toBe(round3(sum(hours.map((h) => h.runMin)) / sum(hours.map((h) => h.plannedMin))));
      }
    }
  });

  it('agrees between Screen 1 just before the Shift ends and Screen 4 after it ends', () => {
    const before = simulate(d, 28799);
    const after = simulate(d, 28800);
    for (const line of before.lines) {
      const view = performanceView(d, after.hours, 28800, { kind: 'line', lineId: line.lineId }, 'last-shift');
      expect(line.availability, line.lineId).toBe(view.oee?.availability ?? 0);
      expect(line.oee, line.lineId).toBe(view.oee?.value ?? 0);
    }
  });

  it('reports whether a Line has output or run minutes this Shift', () => {
    for (const tick of [0, 1, 30, 1800, 28799, 28800, 30600]) {
      for (const line of simulate(d, tick).lines) {
        expect(line.hasProduction).toBe(line.outputThisShift > 0 || line.shiftRunMin > 0);
      }
    }
  });
});

describe('idle history at load', () => {
  it('uses changeover in the C1 tail and first live hours, while earlier gaps keep type reasons', () => {
    const end = Math.max(...d.batches.filter((b) => b.lineId === 'C1').map((b) => b.end));
    const tail = d.hourlyOutput.filter((h) => h.lineId === 'C1' && h.hourStart >= end);
    expect(tail.length).toBeGreaterThan(8);
    for (const h of [...tail, ...readHours(d, 3600).filter((h) => h.lineId === 'C1')]) {
      expect(h.downtime).toEqual([{ reason: 'changeover', minutes: h.plannedMin - h.runMin }]);
    }
    expect(d.hourlyOutput.some((h) => h.lineId === 'C1' && h.hourStart + HOUR < end && h.downtime.some((loss) => loss.reason === 'tool-change'))).toBe(true);
    expect(shiftsFromHours(d.hourlyOutput)).toEqual(d.shiftHistory);
  });
});

it('reports null latency and 100 percent packet loss for Offline Machines in both Screens', () => {
  const snapshot = simulate(d, 100);
  const offline = snapshot.machines.filter((m) => m.status === 'offline');
  expect(offline.length).toBeGreaterThan(0);
  for (const link of offline) {
    expect(link.latencyMs).toBeNull();
    expect(link.packetLossPct).toBe(100);
    expect(connectivityView(d, snapshot).find((row) => row.machineId === link.machineId)).toMatchObject({ latencyMs: null, packetLossPct: 100 });
  }
});

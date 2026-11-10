import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { HOUR } from '../mock/time';
import { shiftsFromHours } from '../mock/history';
import { rangeWindow, performanceWindow } from '../views/ranges';
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

  it('agrees across Event Log and Screen 4 short windows before and after a Shift boundary', () => {
    for (const tick of [0, 100, 3600, 28799, 28800, 30000, 40000]) {
      const snapshot = simulate(d, tick);
      for (const range of ['last-shift', 'last-24h'] as const) {
        expect(rangeWindow(range, tick)).toEqual(performanceWindow(range, tick));
        const window = rangeWindow(range, tick);
        for (const line of snapshot.lines) {
          const scope = { kind: 'line', lineId: line.lineId } as const;
          const view = performanceView(d, snapshot.hours, tick, scope, range);
          const records = [...d.hourlyOutput, ...snapshot.hours].filter(h => h.lineId === line.lineId && h.hourStart >= window.start && h.hourStart < window.end);
          expect(sum(view.output.map(h => h.goodUnits))).toBe(sum(records.map(h => h.goodUnits)));
          if (range === 'last-shift') {
            expect(view).toEqual(performanceView(d, [], 0, scope, range));
          } else {
            const currentShift = view.output.filter(h => h.start >= snapshot.shift.startsAt);
            expect(sum(currentShift.map(h => h.goodUnits))).toBe(line.shiftGoodUnits);
            expect(sum(currentShift.map(h => h.scrapUnits))).toBe(line.scrapThisShift);
            expect(sum(currentShift.map(h => h.targetUnits))).toBe(line.shiftTargetUnits);
          }
        }
      }
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

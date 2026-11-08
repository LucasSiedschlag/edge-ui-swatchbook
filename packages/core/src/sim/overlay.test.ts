import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { raises } from './alarms';
import type { Overlay } from './overlay';
import { tagSeries } from './series';
import { simulate } from './simulate';

const d = generateMockDataset();
const speed = d.tags.find((t) => t.id === 'E1-puller.puller-speed');
const tagId = speed?.id ?? '';
const reading = (tick: number, overlay?: Overlay) => simulate(d, tick, overlay).tags.find((r) => r.tagId === tagId);

describe('overlay: Setpoint Overrides', () => {
  const toMax: Overlay = { setpoints: new Map([[tagId, [{ fromTick: 100, value: speed?.max ?? 0 }]]]) };

  it('keeps computed values identical with an empty Overlay, while recording its identity', () => {
    for (const tick of [0, 50, 500]) {
      const overlay = {};
      expect(simulate(d, tick, overlay)).toEqual({ ...simulate(d, tick), overlay });
    }
  });

  it('applies a new setpoint from its tick and not before, so the past is not redrawn', () => {
    const before = tagSeries(d, tagId, 0, 99, 1, toMax);
    expect(JSON.stringify(before)).toBe(JSON.stringify(tagSeries(d, tagId, 0, 99, 1)));
    const after = tagSeries(d, tagId, 100, 400, 1, toMax);
    const plain = tagSeries(d, tagId, 100, 400, 1);
    const mean = (xs: { value: number }[]) => xs.reduce((a, x) => a + x.value, 0) / xs.length;
    expect(mean(after)).toBeGreaterThan(mean(plain));
  });

  it('matches simulate and tagSeries at the same tick under the same overlay', () => {
    for (const tick of [100, 250, 399]) {
      expect(reading(tick, toMax)).toEqual(tagSeries(d, tagId, tick, tick, 1, toMax).map(({ tick: _t, ...r }) => r)[0]);
    }
  });

  it('raises when an override pushes a Tag over its limit, at the tick it crosses, and not without the override', () => {
    const withOverride = raises(d, 0, 900, toMax).filter((r) => r.tagId === tagId);
    expect(withOverride.length).toBeGreaterThan(0);
    for (const r of withOverride) {
      expect(r.tick).toBeGreaterThanOrEqual(100);
      expect(r.direction).toBe('high');
      expect(reading(r.tick, toMax)?.status).toBe('high');
      expect(reading(r.tick - 1, toMax)?.alarm).toBeNull();
    }
    expect(raises(d, 0, 900).filter((r) => r.tagId === tagId)).toHaveLength(0);
  });

  it('gives the same raises for a range split in two, under an overlay', () => {
    expect(JSON.stringify([...raises(d, 0, 400, toMax), ...raises(d, 400, 900, toMax)])).toBe(JSON.stringify(raises(d, 0, 900, toMax)));
  });
});

describe('overlay: paused Lines', () => {
  const paused: Overlay = { runTicks: (line, from, to) => (line === 'E1' ? Math.max(0, to - from - Math.max(0, Math.min(to, 120) - Math.max(from, 60))) : to - from) };
  const e1 = (tick: number, overlay?: Overlay) => simulate(d, tick, overlay).lines.find((l) => l.lineId === 'E1');

  it('stops producing while the Line is paused, and resumes after', () => {
    expect(e1(120, paused)?.batch?.producedUnits).toBe(e1(60, paused)?.batch?.producedUnits);
    expect(e1(1200, paused)?.batch?.producedUnits).toBeGreaterThan(e1(120, paused)?.batch?.producedUnits ?? 0);
  });

  it('makes up less output this Shift than a Line that never paused, and leaves other Lines alone', () => {
    expect(e1(1200, paused)?.outputThisShift).toBeLessThan(e1(1200)?.outputThisShift ?? 0);
    expect(simulate(d, 1200, paused).lines.find((l) => l.lineId === 'A1')).toEqual(simulate(d, 1200).lines.find((l) => l.lineId === 'A1'));
  });

  it('lowers Availability for the time lost', () => {
    expect(e1(1200, paused)?.availability).toBeLessThan(e1(1200)?.availability ?? 0);
  });
});

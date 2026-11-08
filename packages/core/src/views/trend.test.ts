import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import type { Overlay } from '../sim/overlay';
import { tagSeries } from '../sim/series';
import { TREND_WINDOWS, trendTicks, trendView, type TrendWindowId } from './trend';

const d = generateMockDataset();
const units = d.tags.slice(0, 2).map(tag => tag.unit);
const ids = d.tags.filter(tag => units.includes(tag.unit)).slice(0, 4).map(tag => tag.id);
const windows: TrendWindowId[] = ['5m', '30m', '2h'];

function series(result: ReturnType<typeof trendView>) {
  if (!('series' in result)) throw new Error('expected trend series');
  return result.series;
}

describe('trend aligned grids', () => {
  it('exports the shared window definitions', () => {
    expect(TREND_WINDOWS).toEqual({ '5m': { ticks: 300, step: 2 }, '30m': { ticks: 1800, step: 10 }, '2h': { ticks: 7200, step: 40 } });
  });

  it.each(windows)('%s has exact point counts, aligned endpoints and equal spacing', (window) => {
    const { ticks, step } = TREND_WINDOWS[window];
    for (const tick of [0, 1, 39, 40, 100, 3600, 30000]) {
      const grid = trendTicks(window, tick);
      expect(grid).toHaveLength(window === '5m' ? 150 : 180);
      expect(grid.at(-1)).toBe(Math.floor(tick / step) * step);
      expect(grid[0]).toBe(Math.floor(tick / step) * step - ticks + step);
      for (let i = 1; i < grid.length; i++) expect(grid[i]! - grid[i - 1]!).toBe(step);
    }
  });

  it.each(windows)('%s stays fixed between frames or shifts by exactly one step', (window) => {
    const { step } = TREND_WINDOWS[window];
    for (let tick = 0; tick < 100; tick++) {
      const before = trendTicks(window, tick);
      const after = trendTicks(window, tick + 1);
      if ((tick + 1) % step) expect(after).toEqual(before);
      else {
        expect(after.slice(0, -1)).toEqual(before.slice(1));
        expect(after.at(-1)).toBe(before.at(-1)! + step);
      }
    }
  });

  it('provides the fixed 2h grid before load', () => {
    const grid = trendTicks('2h', 0);
    expect(grid[0]).toBe(-7160);
    expect(grid.at(-1)).toBe(0);
    expect(grid.every((t) => t >= -7500)).toBe(true);
  });
});

describe('trend series', () => {
  it.each(windows)('%s delegates values, statuses and setpoints to tagSeries at exactly the grid ticks', (window) => {
    for (const tick of [0, 101, 30000]) {
      const rows = series(trendView(d, ids, window, tick, {}));
      const grid = trendTicks(window, tick);
      expect(rows.map((s) => s.tagId)).toEqual(ids);
      for (const row of rows) {
        const expected = tagSeries(d, row.tagId, grid[0]!, grid.at(-1)!, TREND_WINDOWS[window].step)
          .map(({ tick, value, status, setpoint }) => ({ tick, value, status, setpoint }));
        expect(row.points).toEqual(expected);
      }
    }
  });

  it('returns the select Tags empty state, supports four Tags and rejects more', () => {
    expect(trendView(d, [], '5m', 0, {})).toEqual({ empty: true });
    expect(series(trendView(d, ids, '5m', 0, {}))).toHaveLength(4);
    expect(trendView(d, d.tags.slice(0, 5).map((t) => t.id), '5m', 0, {})).toEqual({ error: 'trend-limit' });
  });

  it('rejects an unknown Tag without returning a partial series', () => {
    expect(trendView(d, ['missing'], '5m', 0, {})).toEqual({ error: 'unknown-tag' });
    expect(trendView(d, [ids[0]!, 'missing'], '5m', 0, {})).toEqual({ error: 'unknown-tag' });
    expect(trendView(d, [...ids, 'missing'], '5m', 0, {})).toEqual({ error: 'trend-limit' });
  });

  it('applies an overlay at its exact tick and leaves earlier points unchanged', () => {
    const tag = d.tags.find((t) => t.id === 'E1-puller.puller-speed')!;
    const overlay: Overlay = { setpoints: new Map([[tag.id, [{ fromTick: 100, value: tag.max }]]]) };
    const plain = series(trendView(d, [tag.id], '5m', 200, {}))[0]!.points;
    const changed = series(trendView(d, [tag.id], '5m', 200, overlay))[0]!.points;
    expect(changed.filter((p) => p.tick < 100)).toEqual(plain.filter((p) => p.tick < 100));
    expect(changed.find((p) => p.tick === 100)?.setpoint).toBe(tag.max);
    expect(changed.filter((p) => p.tick >= 100).every((p) => p.setpoint === tag.max)).toBe(true);
    expect(changed.find((p) => p.tick === 100)?.value).not.toBe(plain.find((p) => p.tick === 100)?.value);
    expect(changed).toEqual(tagSeries(d, tag.id, -98, 200, 2, overlay).map(({ tick, value, status, setpoint }) => ({ tick, value, status, setpoint })));
  });

  it('is deterministic with frozen dataset, selections and override steps', () => {
    function freeze<T>(value: T): T {
      if (value && typeof value === 'object') {
        Object.freeze(value);
        for (const child of Object.values(value)) freeze(child);
      }
      return value;
    }
    const dataset = freeze(structuredClone(d));
    const selected = freeze([...ids]);
    const steps = freeze([{ fromTick: 100, value: d.tags[0]!.max }]);
    const setpoints = new Map([[ids[0]!, steps]]);
    const overlay = freeze({ setpoints });
    const before = JSON.stringify({ dataset, selected, entries: [...setpoints] });
    const first = trendView(dataset, selected, '2h', 200, overlay);
    trendView(dataset, selected, '5m', 400, {});
    expect(trendView(dataset, selected, '2h', 200, overlay)).toEqual(first);
    series(first)[0]!.points[0]!.value = -1;
    expect(JSON.stringify({ dataset, selected, entries: [...setpoints] })).toBe(before);
    expect(series(trendView(dataset, selected, '2h', 200, overlay))[0]!.points[0]!.value).not.toBe(-1);
  });

  it('computes a 2h window for four Tags with median under 1000 ms including a fresh dataset context', () => {
    const elapsed: number[] = [];
    for (let i = 0; i < 9; i++) {
      const dataset = structuredClone(d);
      const start = performance.now();
      trendView(dataset, ids, '2h', 0, {});
      elapsed.push(performance.now() - start);
    }
    const median = [...elapsed].sort((a, b) => a - b)[4]!;
    console.info(`trend 2h/4 Tags median: ${median.toFixed(3)} ms; max: ${Math.max(...elapsed).toFixed(3)} ms`);
    expect(median).toBeLessThan(1000);
  });
});

it('rejects duplicate Tag ids without returning duplicate series', () => {
  expect(trendView(d, [ids[0]!, ids[0]!], '5m', 0, {})).toEqual({ error: 'duplicate-tag' });
  expect(trendView(d, [ids[0]!, ids[1]!, ids[0]!], '2h', 100, {})).toEqual({ error: 'duplicate-tag' });
});

it('supports four distinct units on four Tags', () => {
  const distinct = [...new Map(d.tags.map(tag => [tag.unit, tag.id])).values()].slice(0, 4);
  expect(distinct).toHaveLength(4);
  expect(series(trendView(d, distinct, '5m', 0, {}))).toHaveLength(4);
});


it('requires an Overlay at the type boundary', () => {
  if (false) {
    // @ts-expect-error Screens must explicitly pass their session Overlay.
    trendView(d, ids, '5m', 0);
  }
});

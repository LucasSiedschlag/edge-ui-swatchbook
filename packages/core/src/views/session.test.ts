import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { alarmList, createPlantState, reduce, type PlantAction } from '../plant';
import { simulate } from '../sim/simulate';
import { alarmListView } from './alarms';
import { criticalBannerView } from './banner';
import { eventLogView } from './events';
import { performanceView } from './performance';
import { performanceWindow, rangeWindow } from './ranges';
import { connectivityView, tagGridView } from './tags';
import { trendTicks, trendView } from './trend';

const d = generateMockDataset();
const state = createPlantState(d);
const negative = { ...simulate(d, 0), tick: -1 };
const calls: [string, () => unknown][] = [
  ['performanceView', () => performanceView(d, [], -1, { kind: 'site' }, 'last-shift')],
  ['trendView empty', () => trendView(d, [], '5m', -1, {})],
  ['trendView selected', () => trendView(d, [d.tags[0]!.id], '5m', -1, {})],
  ['trendTicks', () => trendTicks('5m', -1)],
  ['rangeWindow', () => rangeWindow('last-shift', -1)],
  ['performanceWindow short', () => performanceWindow('last-24h', -1)],
  ['performanceWindow fixed', () => performanceWindow('last-30d', -1)],
  ['alarmListView', () => alarmListView(state, -1)],
  ['eventLogView', () => eventLogView(state, -1)],
  ['criticalBannerView', () => criticalBannerView(state, -1, 'E1')],
  ['tagGridView', () => tagGridView(d, negative)],
  ['connectivityView', () => connectivityView(d, negative)],
];

describe('Screen selectors accept only session ticks', () => {
  it.each(calls)('%s rejects negative ticks at entry', (_, call) => {
    expect(call).toThrow(new Error('tick must be 0 or more'));
  });
});

it('runs a complete session without mutating a deeply frozen Mock Dataset', () => {
  function freeze<T>(value: T): T {
    if (value && typeof value === 'object') {
      Object.freeze(value);
      for (const child of Object.values(value)) freeze(child);
    }
    return value;
  }
  const dataset = freeze(generateMockDataset());
  const before = JSON.stringify(dataset);
  expect(() => {
    let current = createPlantState(dataset);
    const tag = dataset.tags.find((t) => t.lineId === 'E2' && t.writable)!;
    const actions: PlantAction[] = [
      { type: 'pause', lineId: 'E2' },
      { type: 'setpoint-override', tagId: tag.id, value: tag.max, reason: 'Frozen session' },
      { type: 'shift-handover', note: 'Frozen session' },
      { type: 'new-draft', versionId: dataset.recipeVersions.find((v) => v.status === 'approved' && !dataset.recipeVersions.some((other) => other.recipeId === v.recipeId && other.status === 'draft'))!.id },
    ];
    for (const action of actions) {
      const result = reduce(current, action, { tick: 100 });
      if (!result.ok) throw new Error(result.error.code);
      current = result.state;
    }
    for (const tick of [100, 3600, 30000]) {
      const snapshot = simulate(dataset, tick, current.overlay);
      alarmList(current, tick);
      performanceView(dataset, snapshot.hours, tick, { kind: 'site' }, 'last-24h');
      eventLogView(current, tick);
      tagGridView(dataset, snapshot);
      trendView(dataset, [tag.id], '2h', tick, current.overlay);
    }
  }).not.toThrow();
  expect(JSON.stringify(dataset)).toBe(before);
});

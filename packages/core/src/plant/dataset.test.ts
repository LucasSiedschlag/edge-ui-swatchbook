import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import type { MockDataset } from '../mock/types';
import { createPlantState } from './state';

const d = generateMockDataset();

describe('Mock Dataset validation at entry', () => {
  it('rejects an orphan Event Log User with the entry id and unknown User', () => {
    const dataset = structuredClone(d);
    dataset.events[0]!.userId = 'missing-user';
    expect(() => createPlantState(dataset)).toThrow(`Event ${dataset.events[0]!.id} names unknown User missing-user`);
  });

  const cases: [string, (dataset: MockDataset) => void, string][] = [
    ['Alarm Machine', (x) => { x.alarms[0]!.machineId = 'missing-machine'; }, `Alarm ${d.alarms[0]!.id} names unknown Machine missing-machine`],
    ['Alarm Line', (x) => { x.alarms[0]!.lineId = 'missing' as never; }, `Alarm ${d.alarms[0]!.id} names unknown Line missing`],
    ['Machine Line', (x) => { x.machines[0]!.lineId = 'missing' as never; }, `Machine ${d.machines[0]!.id} names unknown Line missing`],
    ['Batch Line', (x) => { x.batches[0]!.lineId = 'missing' as never; }, `Batch ${d.batches[0]!.id} names unknown Line missing`],
    ['active Batch Line', (x) => { x.activeBatches[0]!.lineId = 'missing' as never; }, `Batch ${d.activeBatches[0]!.id} names unknown Line missing`],
    ['Lot Batch', (x) => { x.lots[0]!.batchId = 'missing-batch'; }, `Lot ${d.lots[0]!.id} names unknown Batch missing-batch`],
    ['Tag Machine', (x) => { x.tags[0]!.machineId = 'missing-machine'; }, `Tag ${d.tags[0]!.id} names unknown Machine missing-machine`],
    ['Tag Line', (x) => { x.tags[0]!.lineId = 'missing' as never; }, `Tag ${d.tags[0]!.id} names unknown Line missing`],
  ];
  it.each(cases)('rejects an orphan %s', (_, change, message) => {
    const dataset = structuredClone(d);
    change(dataset);
    expect(() => createPlantState(dataset)).toThrow(message);
  });

  it.each(['events', 'alarms', 'recipeVersions'] as const)('rejects duplicate ids in %s', (section) => {
    const dataset = structuredClone(d);
    dataset[section][1]!.id = dataset[section][0]!.id;
    expect(() => createPlantState(dataset)).toThrow(`duplicate id ${dataset[section][0]!.id} in ${section}`);
  });

  it('reports the first bad Event Log entry in dataset order', () => {
    const dataset = structuredClone(d);
    dataset.events[0]!.userId = 'first';
    dataset.events[1]!.userId = 'second';
    expect(() => createPlantState(dataset)).toThrow(`Event ${dataset.events[0]!.id} names unknown User first`);
  });
});

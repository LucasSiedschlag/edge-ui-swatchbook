import { describe, expect, it } from 'vitest';
import { generateMockDataset } from './generate';
import { findBatch } from './lookup';

const d = generateMockDataset();

describe('findBatch', () => {
  it('finds a finished Batch', () => {
    const b = d.batches[100];
    expect(findBatch(d, b?.id ?? '')).toBe(b);
  });

  it('finds a running Batch', () => {
    const b = d.activeBatches[0];
    expect(findBatch(d, b?.id ?? '')).toBe(b);
  });

  it('resolves every Lot and Alarm Batch reference', () => {
    for (const l of d.lots) expect(findBatch(d, l.batchId)).toBeDefined();
    for (const a of d.alarms) if (a.batchId) expect(findBatch(d, a.batchId)).toBeDefined();
  });

  it('returns undefined for an unknown id', () => {
    expect(findBatch(d, 'B-NOPE-00000')).toBeUndefined();
  });
});

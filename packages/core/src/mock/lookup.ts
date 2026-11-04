import type { ActiveBatch, Batch, MockDataset } from './types';

/** Finds a Batch by id among finished and running Batches. Lots, Alarms and Genealogy can point at either. */
export function findBatch(d: Pick<MockDataset, 'batches' | 'activeBatches'>, id: string): Batch | ActiveBatch | undefined {
  return d.batches.find((b) => b.id === id) ?? d.activeBatches.find((b) => b.id === id);
}

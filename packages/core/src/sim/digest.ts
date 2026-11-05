import type { MockDataset } from '../mock/types';
import { hash } from './noise';
import { tagSeries } from './series';
import { simulate } from './simulate';

/**
 * A short fingerprint of what the Simulator gives at some ticks. Every browser must give the same one for the same dataset,
 * so the Playwright suite (Issue 8) compares it across Chromium, Firefox and WebKit. Ticks before 0 fingerprint Tag values only.
 */
export function snapshotDigest(d: MockDataset, ticks: readonly number[]): string {
  const parts = ticks.map((tick) =>
    tick >= 0 ? simulate(d, tick) : d.tags.map((t) => tagSeries(d, t.id, tick, tick)[0]),
  );
  return hash(JSON.stringify(parts)).toString(16).padStart(8, '0');
}

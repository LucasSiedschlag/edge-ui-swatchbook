export const LOCALES = ['en', 'pt-BR'] as const;
export type Locale = (typeof LOCALES)[number];

export const SCREENS = [
  { id: 'deck', route: '/deck' },
  { id: 'recipes', route: '/recipes' },
  { id: 'ledger', route: '/ledger' },
  { id: 'performance', route: '/performance' },
  { id: 'parameters', route: '/parameters' },
  { id: 'control', route: '/control' },
] as const;
export type ScreenId = (typeof SCREENS)[number]['id'];

export { DEFAULT_SEED, generateMockDataset } from './mock/generate';
export type * from './mock/types';
export { findBatch } from './mock/lookup';
export { simulate, type Snapshot } from './sim/simulate';
export { raises, returns, type Raise, type Return } from './sim/alarms';
export { tagSeries, type SeriesPoint } from './sim/series';
export { snapshotDigest } from './sim/digest';
export type { Overlay, SetpointStep } from './sim/overlay';
export { shiftInfo, simulatedTime, tickAt, TICK_MS, type ShiftInfo } from './sim/clock';
export type { LineLive, BatchProgress } from './sim/kpis';
export type { MachineLink } from './sim/links';
export type { TagReading, TagStatus } from './sim/tags';

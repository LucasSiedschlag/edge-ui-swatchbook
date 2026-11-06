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
export { alarmTransitions, raises, returns, type AlarmTransition, type Raise, type Return } from './sim/alarms';
export { MAX_TICK } from './sim/context';
export { tagSeries, firstTick, type SeriesPoint } from './sim/series';
export { snapshotDigest } from './sim/digest';
export { setpointAt, type Overlay, type SetpointStep } from './sim/overlay';
export { shiftInfo, simulatedTime, tickAt, TICK_MS, type ShiftInfo } from './sim/clock';
export type { LineLive, BatchProgress } from './sim/kpis';
export type { MachineLink } from './sim/links';
export type { TagReading, TagStatus } from './sim/tags';
export {
  createPlantState, createPlantStore, alarmList, criticalAlarms, lineStatus, isDirty, recipeCheck, recipeList, reduce, checkRecipeVersion, diePressureLimit, failingRules,
  type LineStatus, type StopReason, type PlantErrorCode, type HandoverNote, type ActionContext, type ActionResult, type PlantAction, type PlantError, type PlantState, type PlantStore, type RecipeRow, type RuleResult, type RuleViolation,
} from './plant';
export * from './views';

import {
  createPlantStore, generateMockDataset, plantErrorLabels, simulate,
  type ActionResult, type MessageKey, type MockDataset, type PlantAction, type PlantState, type Snapshot, type StorageLike,
} from '@swatchbook/core';
import { createContext, useCallback, useContext, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { readTestTick, useSessionClock } from './clock';
import type { LibraryId } from './registry';
import { PreferencesProvider } from './preferences';
import { ShortcutsProvider, type RowFocusPredicate } from './shortcuts';
import { TourProvider } from './tour';

export interface RuntimeProviderProps {
  children?: ReactNode;
  libraryId: LibraryId;
  supportsDensity: boolean;
  dataset?: MockDataset;
  storage?: StorageLike;
  languages?: readonly string[];
  search?: string;
  now?: () => number;
  rowFocused?: RowFocusPredicate;
}
export interface Simulation { dataset: MockDataset; tick: number; state: PlantState; snapshot: Snapshot }
export type Dispatch = (action: PlantAction) => ActionResult;
const SimulationContext = createContext<Simulation | null>(null);
const ActionsContext = createContext<Dispatch | null>(null);

export function RuntimeProvider({ children, dataset, search, now, supportsDensity, storage, languages, rowFocused }: RuntimeProviderProps) {
  const session = useRef<ReturnType<typeof createPlantStore> | null>(null);
  if (!session.current) session.current = createPlantStore(dataset ?? generateMockDataset());
  const store = session.current;
  const initialSearch = useRef(search ?? location.search);
  const clock = useSessionClock({ now, fixedTick: readTestTick(initialSearch.current) });
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const tick = Math.max(clock.tick, state.lastTick);
  // A ref also avoids duplicate Simulator work during StrictMode render checks.
  const cachedSnapshot = useRef<Snapshot | null>(null);
  if (!cachedSnapshot.current || cachedSnapshot.current.tick !== tick || cachedSnapshot.current.overlay !== state.overlay) {
    cachedSnapshot.current = simulate(state.dataset, tick, state.overlay);
  }
  const snapshot = cachedSnapshot.current;
  const simulation = useMemo(() => ({ dataset: state.dataset, tick, state, snapshot }), [tick, state, snapshot]);
  const dispatch = useCallback<Dispatch>(action => store.dispatch(action, clock.readTick()), [store, clock.readTick]);
  return <PreferencesProvider supportsDensity={supportsDensity} storage={storage} languages={languages}>
    <ActionsContext value={dispatch}>
      <SimulationContext value={simulation}>
        <ShortcutsProvider rowFocused={rowFocused}><TourProvider>{children}</TourProvider></ShortcutsProvider>
      </SimulationContext>
    </ActionsContext>
  </PreferencesProvider>;
}

export function useSimulation(): Simulation {
  const value = useContext(SimulationContext);
  if (!value) throw new Error('useSimulation requires RuntimeProvider');
  return value;
}
export function useActions(): Dispatch {
  const value = useContext(ActionsContext);
  if (!value) throw new Error('useActions requires RuntimeProvider');
  return value;
}
export function actionErrorLabel(result: ActionResult): MessageKey | null {
  return result.ok ? null : plantErrorLabels[result.error.code];
}

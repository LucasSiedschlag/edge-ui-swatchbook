import type { MockDataset } from '../mock/types';
import { reduce } from './reduce';
import { createPlantState } from './state';
import type { ActionResult, PlantAction, PlantState } from './types';

export interface PlantStore {
  /** Libraries read alarmList(getState(), tick) each frame. No clock action is needed. */
  getState(): PlantState;
  /** Applies an action at a tick. The state changes only when the result is ok. Listeners hear about every change. */
  dispatch(action: PlantAction, tick: number): ActionResult;
  subscribe(listener: (state: PlantState) => void): () => void;
}

/** A small store for any UI framework. State resets on reload, because it only lives in memory. */
export function createPlantStore(d: MockDataset): PlantStore {
  let state = createPlantState(d);
  const listeners = new Set<(s: PlantState) => void>();
  return {
    getState: () => state,
    dispatch(action, tick) {
      const result = reduce(state, action, { tick });
      if (result.ok) {
        const previous = state;
        state = result.state;
        if (state !== previous) for (const l of [...listeners]) l(state);
      }
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

import { TOUR_STEPS, isLastStep, nextStep, previousStep, stepForRoute, tourStepAt, type TourStep } from '@swatchbook/core';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useRoute } from './route';

export interface TourState { active: boolean; index: number }
export type TourAction = 'start' | 'next' | 'previous' | 'finish';
export function tourTransition(state: TourState, action: TourAction): TourState {
  if (action === 'start') return { active: true, index: 0 };
  if (action === 'finish') return { active: false, index: 0 };
  if (!state.active) return state;
  const index = action === 'next' ? nextStep(state.index) : previousStep(state.index);
  return index === null ? state : { active: true, index };
}
export interface RuntimeTour extends TourState {
  step: TourStep | undefined;
  total: number;
  start(): void;
  next(): void;
  previous(): void;
  finish(): void;
  isFirst: boolean;
  isLast: boolean;
}
const TourContext = createContext<RuntimeTour | null>(null);
export function TourProvider({ children }: { children: ReactNode }) {
  const [started, setStarted] = useState(false);
  const { route, go } = useRoute();
  const routeIndex = stepForRoute(route ?? '');
  // End on the render that observes an outside route, before normalization effects.
  if (started && routeIndex === null) setStarted(false);
  const active = started && routeIndex !== null;
  const index = active ? routeIndex : 0;
  const value = useMemo<RuntimeTour>(() => ({
    active, index, step: active ? tourStepAt(index) : undefined, total: TOUR_STEPS.length,
    start: () => { go(TOUR_STEPS[0]!.screen); setStarted(true); },
    next: () => { const next = active ? nextStep(index) : null; if (next !== null) go(TOUR_STEPS[next]!.screen); },
    previous: () => { const previous = active ? previousStep(index) : null; if (previous !== null) go(TOUR_STEPS[previous]!.screen); },
    finish: () => setStarted(false),
    isFirst: active && index === 0, isLast: active && isLastStep(index),
  }), [active, index, go]);
  return <TourContext value={value}>{children}</TourContext>;
}
export function useTour(): RuntimeTour {
  const value = useContext(TourContext);
  if (!value) throw new Error('useTour requires RuntimeProvider');
  return value;
}

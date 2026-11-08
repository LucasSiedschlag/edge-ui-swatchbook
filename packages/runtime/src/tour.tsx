import { TOUR_STEPS, isLastStep, nextStep, previousStep, tourStepAt, type TourStep } from '@swatchbook/core';
import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
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
  const [state, dispatch] = useReducer(tourTransition, { active: false, index: 0 });
  const { go } = useRoute();
  useEffect(() => {
    if (state.active) go(tourStepAt(state.index)!.screen);
  }, [state, go]);
  const value = useMemo<RuntimeTour>(() => ({
    ...state, step: state.active ? tourStepAt(state.index) : undefined, total: TOUR_STEPS.length,
    start: () => dispatch('start'), next: () => dispatch('next'), previous: () => dispatch('previous'), finish: () => dispatch('finish'),
    isFirst: state.active && state.index === 0, isLast: state.active && isLastStep(state.index),
  }), [state]);
  return <TourContext value={value}>{children}</TourContext>;
}
export function useTour(): RuntimeTour {
  const value = useContext(TourContext);
  if (!value) throw new Error('useTour requires RuntimeProvider');
  return value;
}

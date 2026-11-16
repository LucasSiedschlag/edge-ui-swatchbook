import type { ComponentType } from 'react';
import type { ScreenId } from '@swatchbook/core';
import { Recipes } from './Recipes';
import { Ledger } from './Ledger';
import { Deck } from './Deck';
import { Performance } from './Performance';
import { Parameters } from './Parameters';
import { Control } from './Control';

// Keyed by every ScreenId, so the compiler fails when a Screen is added to core and not built here.
const BUILT: Record<ScreenId, ComponentType> = { deck: Deck, recipes: Recipes, ledger: Ledger, performance: Performance, parameters: Parameters, control: Control };

export function Screen({ screen }: { screen: ScreenId }) {
  const Built = BUILT[screen];
  return <Built />;
}

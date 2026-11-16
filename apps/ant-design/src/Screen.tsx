import type { ScreenId } from '@swatchbook/core';
import { Ledger } from './Ledger';
import { Deck } from './Deck';
import { Performance } from './Performance';
import { Parameters } from './Parameters';
import { Control } from './Control';
import { Placeholder } from './Placeholder';

export function Screen({ screen }: { screen: ScreenId }) {
  return screen === 'deck' ? <Deck /> : screen === 'ledger' ? <Ledger /> : screen === 'performance' ? <Performance /> : screen === 'parameters' ? <Parameters /> : screen === 'control' ? <Control /> : <Placeholder screen={screen} />;
}

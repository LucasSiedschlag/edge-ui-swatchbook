import type { ScreenId } from '@swatchbook/core';
import { Deck } from './Deck';
import { Control } from './Control';
import { Placeholder } from './Placeholder';

export function Screen({ screen }: { screen: ScreenId }) {
  return screen === 'deck' ? <Deck /> : screen === 'control' ? <Control /> : <Placeholder screen={screen} />;
}

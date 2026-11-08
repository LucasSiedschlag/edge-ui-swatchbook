import type { ScreenId } from '@swatchbook/core';
import { Deck } from './Deck';
import { Placeholder } from './Placeholder';

export function Screen({ screen }: { screen: ScreenId }) {
  return screen === 'deck' ? <Deck /> : <Placeholder screen={screen} />;
}

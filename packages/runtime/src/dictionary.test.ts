import { en, ptBR, SCREENS } from '@swatchbook/core';
import { expect, it } from 'vitest';
import { LIBRARIES, LIBRARY_NOT_BUILT_KEY } from './registry';
import { PRESETS } from './preferences';

// Everything the Shell shows from the runtime must exist in the dictionary, in both languages.
const keys = [
  LIBRARY_NOT_BUILT_KEY,
  'shell.preset',
  'tour.start',
  ...PRESETS.map((p) => `preset.${p.id}`),
  ...SCREENS.map((s) => `screen.${s.id}`),
];

it.each(keys)('has "%s" in en and pt-BR', (key) => {
  expect((en as Record<string, string>)[key], `en ${key}`).toBeTruthy();
  expect((ptBR as Record<string, string>)[key], `pt-BR ${key}`).toBeTruthy();
});

it('lists the three v1 Libraries, only Ant Design built', () => {
  expect(LIBRARIES.map((l) => [l.id, l.status])).toEqual([['ant-design', 'built'], ['ui5', 'planned'], ['ix', 'planned']]);
});

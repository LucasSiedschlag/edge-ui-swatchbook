import { expectTypeOf, it } from 'vitest';
import { LOCALES, SCREENS } from '../index';
import { en, ptBR } from './messages';
import type { MessageKey } from './messages';
import type { Locale } from './types';
import { screenLabels } from './labels';
import { t } from './translate';

it('keeps public locale and Screen types in sync with the root constants', () => {
  expectTypeOf<Locale>().toEqualTypeOf<(typeof LOCALES)[number]>();
  expectTypeOf<keyof typeof screenLabels>().toEqualTypeOf<(typeof SCREENS)[number]['id']>();
});

// This function is checked by tsc, never invoked at runtime.
function dictionaryTypeProofs(): void {
  const { 'area.extrusion': omitted, ...incomplete } = ptBR;
  void omitted;
  // @ts-expect-error A missing Portuguese key must fail the build.
  const missing: Record<MessageKey, string> = incomplete;
  // @ts-expect-error An extra Portuguese key must fail the build.
  const extra: Record<MessageKey, string> = { ...ptBR, 'unknown.key': 'Unknown' };
  // @ts-expect-error Strict translation only accepts canonical message keys.
  t('en', 'unknown.key');
  // @ts-expect-error Locales are restricted to the two supported languages.
  t('fr', 'area.extrusion');
  // @ts-expect-error Parameter values must be strings or numbers.
  t('en', 'line.extrusion', { n: true });
  void [missing, extra, en];
}
void dictionaryTypeProofs;

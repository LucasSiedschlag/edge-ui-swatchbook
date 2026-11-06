import { expect, expectTypeOf, it } from 'vitest';
import * as api from './index';
import type { Locale, MessageKey, MessageParams, Preferences, StorageLike, NumberOptions, TimeOptions } from './index';

it('exports the complete public i18n API and its types', () => {
  for (const name of [
    'en', 'ptBR', 't', 'tr', 'resolveLocale', 'formatNumber', 'formatPercent',
    'formatDate', 'formatTime', 'formatDateTime', 'formatDuration',
    'PREFERENCES_KEY', 'loadPreferences', 'savePreferences', 'plantErrorLabels', 'scopeLabels',
  ]) expect(api).toHaveProperty(name);
  expectTypeOf<Locale>().toEqualTypeOf<'en' | 'pt-BR'>();
  expectTypeOf<MessageKey>().toEqualTypeOf<keyof typeof api.en>();
  expectTypeOf<MessageParams>().toEqualTypeOf<Readonly<Record<string, string | number>>>();
  expectTypeOf<Preferences['language']>().toEqualTypeOf<Locale>();
  expectTypeOf<StorageLike['getItem']>().toEqualTypeOf<(k: string) => string | null>();
  expectTypeOf<NumberOptions>().toEqualTypeOf<{ decimals?: number }>();
  expectTypeOf<TimeOptions>().toEqualTypeOf<{ seconds?: boolean }>();
});

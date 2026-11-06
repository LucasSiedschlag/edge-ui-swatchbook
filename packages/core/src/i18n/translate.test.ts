import { describe, expect, it } from 'vitest';
import { LOCALES } from '../index';
import { t, tr, resolveLocale } from './translate';

describe('translation', () => {
  it('matches supported locales and resolves the first supported browser language', () => {
    expect(LOCALES).toEqual(['en', 'pt-BR']);
    for (const [languages, expected] of [
      [[], 'en'], [['fr', 'ja'], 'en'], [['pt'], 'pt-BR'], [['pt-PT'], 'pt-BR'],
      [['fr', 'en-GB', 'pt-BR'], 'en'], [['de', 'PT-br', 'en'], 'pt-BR'],
    ] as const) expect(resolveLocale(languages)).toBe(expected);
  });

  it('interpolates strings and numbers without translating identifiers or units', () => {
    expect(t('pt-BR', 'line.extrusion', { n: 2 })).toBe('Linha de extrusão 2');
    expect(t('en', 'tour.progress', { current: 1, total: 6 })).toBe('Step 1 of 6');
    expect(tr('pt-BR', { key: 'alarm.high-value', params: { tag: 'E1.temp °C' } })).toBe('Valor alto em E1.temp °C');
    expect(t('pt-BR', 'recipe.extrusion', { product: 'WIN-1L-60' })).toBe('Receita de extrusão para WIN-1L-60');
    expect(t('en', 'product.window-fixed', { code: '$& {n}' })).toBe('Fixed window ($& {n})');
  });

  it('keeps missing placeholders visible and ignores extra parameters', () => {
    expect(t('en', 'tour.progress', { current: 0, extra: 'unused' })).toBe('Step 0 of {total}');
    expect(t('en', 'line.extrusion')).toBe('Extrusion Line {n}');
    expect(t('en', 'line.extrusion', { n: '' })).toBe('Extrusion Line ');
    expect(t('en', 'line.extrusion', Object.create({ n: 5 }) as Record<string, number>)).toBe('Extrusion Line {n}');
  });

  it('returns a visible fallback for unknown data keys without throwing', () => {
    for (const key of ['unknown.key', 'toString', '__proto__', 'constructor']) {
      expect(tr('en', { key })).toBe(`[[${key}]]`);
      expect(tr('pt-BR', { key, params: { tag: 'unchanged' } })).toBe(`[[${key}]]`);
    }
  });
});

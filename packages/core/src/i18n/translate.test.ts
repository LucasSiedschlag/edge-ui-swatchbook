import { describe, expect, it } from 'vitest';
import { LOCALES } from '../index';
import { t, tr, tCount, resolveLocale } from './translate';

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

it('matches complete language prefixes and ignores malformed entries', () => {
  expect(resolveLocale(['ptx', 'en'])).toBe('en');
  expect(resolveLocale([undefined, null, 42, {}, 'PT-br'])).toBe('pt-BR');
  expect(resolveLocale(['en-GB'])).toBe('en');
});

describe('tCount', () => {
  it('uses the singular only for exactly one, in both languages', () => {
    expect(tCount('en', 'deck.alarm-count', 1)).toBe('1 active Critical Alarm');
    expect(tCount('en', 'deck.alarm-count', 0)).toBe('0 active Critical Alarms');
    expect(tCount('en', 'deck.alarm-count', 2)).toBe('2 active Critical Alarms');
    expect(tCount('pt-BR', 'deck.alarm-count', 1)).toBe('1 Alarme crítico ativo');
    expect(tCount('pt-BR', 'deck.alarm-count', 0)).toBe('0 Alarmes críticos ativos');
    expect(tCount('pt-BR', 'deck.alarm-count', 3)).toBe('3 Alarmes críticos ativos');
  });

  it('covers the other counted texts and accepts extra params', () => {
    expect(tCount('en', 'common.row-count', 1)).toBe('1 record');
    expect(tCount('pt-BR', 'common.row-count', 5000)).toBe('5000 registros');
    expect(tCount('en', 'common.selected-count', 1)).toBe('1 selected');
    expect(tCount('pt-BR', 'ledger.selected-hidden', 1)).toBe('1 lote de produção selecionado oculto pelos filtros');
  });

  it('only accepts keys that have both forms (a compile time check)', () => {
    expect(() => {
      // @ts-expect-error a key without .one and .other is not a counted text
      tCount('en', 'deck.pause', 1);
    }).toThrow();
  });
});

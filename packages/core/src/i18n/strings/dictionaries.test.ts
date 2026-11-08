import type { ViolationKind } from '../../plant/rules';
import type { BatchDetail, CompareView, SelectionResult } from '../../views/ledger';
import baseSource from '../messages.ts?raw';
import { SHORTCUT_MESSAGES } from '../../shortcuts';
import { TOUR_MESSAGES } from '../../tour';
import commonSource from './common.ts?raw';
import deckSource from './deck.ts?raw';
import recipesSource from './recipes.ts?raw';
import ledgerSource from './ledger.ts?raw';
import performanceSource from './performance.ts?raw';
import parametersSource from './parameters.ts?raw';
import controlSource from './control.ts?raw';
import { describe, expect, it } from 'vitest';
import { en, ptBR, type MessageKey } from '../messages';
import { t } from '../translate';
import * as common from './common';
import * as deck from './deck';
import * as recipes from './recipes';
import * as ledger from './ledger';
import * as performance from './performance';
import * as parameters from './parameters';
import * as control from './control';

const modules: Record<string, { en: Record<string, string>; ptBR: Record<string, string> }> = { common, deck, recipes, ledger, performance, parameters, control };
const sources: Record<string, string> = { common: commonSource, deck: deckSource, recipes: recipesSource, ledger: ledgerSource, performance: performanceSource, parameters: parametersSource, control: controlSource };
const declaredKeys = (source: string) => [...source.matchAll(/^\s*["']([a-z][a-z0-9.-]+)["']:/gm)].map(match => match[1]!);
const placeholders = (text: string) => [...new Set([...text.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]!))].sort();

describe('Screen dictionaries', () => {
  it('has unique keys across files and existing domain messages', () => {
    // Inspect declarations before merging: a spread could silently replace a key.
    const screenKeys = Object.values(sources).flatMap(source => declaredKeys(source.split('} as const;')[0]!));
    const keys = [...declaredKeys(baseSource), ...Object.keys(TOUR_MESSAGES.en),
      ...Object.keys(SHORTCUT_MESSAGES.en), ...screenKeys];
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(Object.keys(en).sort());
    for (const [namespace, source] of Object.entries(sources)) {
      expect(declaredKeys(source.split('} as const;')[0]!).sort()).toEqual(Object.keys(modules[namespace]!.en).sort());
    }
  });

  for (const [namespace, module] of Object.entries(modules)) {
    it(`${namespace} has matching, namespaced, nonempty translations and renders every placeholder`, () => {
      expect(Object.keys(module.en).length).toBeGreaterThan(0);
      expect(Object.keys(module.ptBR).sort()).toEqual(Object.keys(module.en).sort());
      for (const [key, value] of Object.entries(module.en)) {
        expect(key).toMatch(new RegExp(`^${namespace}\\.[a-z][a-z0-9-]*(\\.[a-z][a-z0-9-]*)*$`));
        const translated = module.ptBR[key]!;
        expect(value.trim(), key).not.toBe('');
        expect(translated.trim(), key).not.toBe('');
        expect(value + translated, key).not.toMatch(/[\u2013\u2014]/);
        expect(placeholders(translated), key).toEqual(placeholders(value));
        const params = Object.fromEntries(placeholders(value).map(name => [name, `sample-${name}`]));
        for (const locale of ['en', 'pt-BR'] as const) {
          expect(t(locale, key as MessageKey, params), key).not.toMatch(/\{[^{}]+\}/);
        }
        expect(en[key as MessageKey], key).toBe(value);
        expect(ptBR[key as MessageKey], key).toBe(translated);
      }
    });
  }

  it('reuses domain actions and adds the missing shared buttons', () => {
    for (const action of ['add-step', 'remove-step', 'move-up', 'move-down', 'clear-filters', 'compare', 'close', 'cancel', 'confirm', 'expand-banner', 'collapse-banner', 'submit-handover']) {
      expect(Object.hasOwn(en, `action.${action}`), action).toBe(true);
      expect(Object.hasOwn(ptBR, `action.${action}`), action).toBe(true);
    }
    expect(common.en['common.none']).toBe('-');
    expect(deck.en['deck.estop-confirm.body']).toContain('Reset');
  });
});

it('covers all four rule detail templates and the Ledger result codes', () => {
  const violations = {
    'below-min': 'recipes.violation.below-min', 'above-max': 'recipes.violation.above-max',
    'adjacent-too-far': 'recipes.violation.adjacent-too-far', missing: 'recipes.violation.missing',
  } satisfies Record<ViolationKind, keyof typeof recipes.en>;
  for (const key of Object.values(violations)) {
    expect(placeholders(recipes.en[key])).toEqual(['actual', 'limit', 'parameter', 'unit']);
  }
  type ResultCode = Extract<CompareView | BatchDetail, { error: string }>['error'] | SelectionResult['result'];
  const results = {
    'compare-count': 'ledger.result.compare-count', 'unknown-batch': 'ledger.result.unknown-batch',
    'selection-limit': 'ledger.result.selection-limit', selected: 'ledger.result.selected',
    deselected: 'ledger.result.deselected',
  } satisfies Record<ResultCode, MessageKey>;
  for (const key of Object.values(results)) {
    expect(Object.hasOwn(ledger.en, key), key).toBe(true);
  }
});

it('covers chart series, captions, tables and block-specific empty states', () => {
  for (const key of ['performance.series.good', 'performance.series.scrap', 'performance.series.target', 'performance.series.cumulative-percentage', 'parameters.series.limit', 'parameters.trend-caption', 'performance.pareto-caption', 'performance.output-caption', 'performance.shift-history-caption', 'performance.oee-empty', 'performance.pareto-empty', 'performance.output-empty', 'performance.shift-history-empty', 'performance.comparison-empty', 'performance.quality-empty', 'parameters.grid-empty', 'parameters.connectivity-empty', 'control.alarm-empty', 'control.event-empty', 'control.diagnostics-empty']) {
    expect(Object.hasOwn(en, key), key).toBe(true);
  }
  expect(en['trend-error.nothing-selected']).toBe('Select Tags to show a trend.');
});

it('makes a broken maximum rule explicit without assuming an inclusive limit', () => {
  expect(recipes.en['recipes.violation.above-max']).toContain('violates the maximum rule limit');
  expect(recipes.ptBR['recipes.violation.above-max']).toContain('viola o limite máximo da regra');
});

it('does not impose a unit-count restriction on the selected trend Tags', () => {
  expect(Object.hasOwn(en, 'trend-error.trend-units')).toBe(false);
  for (const value of Object.values(parameters.en)) expect(value).not.toContain('two distinct units');
});

it('provides whole Screen empty messages alongside the block messages', () => {
  for (const key of ['recipes.empty', 'performance.empty', 'parameters.empty']) {
    expect(Object.hasOwn(en, key), key).toBe(true);
  }
});

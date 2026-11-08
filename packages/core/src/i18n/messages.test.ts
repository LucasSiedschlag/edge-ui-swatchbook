import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { raises } from '../sim/alarms';
import { en, ptBR, type MessageKey } from './messages';
import { t, tCount } from './translate';
import * as labels from './labels';

const placeholders = (text: string) => [...new Set([...text.matchAll(/\{([a-z]+)\}/g)].map((m) => m[1]))].sort();

describe('dictionaries', () => {
  it('has matching nonempty messages and placeholder sets', () => {
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort());
    for (const [key, text] of Object.entries(en)) {
      expect(key).toMatch(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/);
      expect(text.trim(), key).not.toBe('');
      const translated = ptBR[key as keyof typeof en];
      expect(translated.trim(), key).not.toBe('');
      expect(placeholders(translated), key).toEqual(placeholders(text));
      expect(text + translated).not.toMatch(/[\u2013\u2014]/);
    }
  });

  it('covers every TextRef in the dataset and Simulator output', () => {
    const found = new Set<string>();
    const scan = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      if ('key' in value && typeof value.key === 'string' && Object.keys(value).every((k) => k === 'key' || k === 'params')) {
        found.add(value.key);
        expect(Object.hasOwn(en, value.key), value.key).toBe(true);
        expect(Object.hasOwn(ptBR, value.key), value.key).toBe(true);
      }
      for (const child of Object.values(value)) scan(child);
    };
    for (const seed of [undefined, 1, 42]) {
      const dataset = generateMockDataset(seed);
      scan(dataset);
      scan(raises(dataset, 0, 3600));
    }
    expect([...found].filter((k) => k.startsWith('note.'))).toHaveLength(8);
    expect([...found].filter((k) => k.startsWith('alarm.'))).toHaveLength(5);
  });

  it('provides dictionary keys for every typed enumeration mapping', () => {
    const mappings = Object.values(labels).filter(value => typeof value !== 'function');
    expect(mappings).toHaveLength(27);
    for (const mapping of mappings) {
      for (const key of Object.values(mapping)) {
        expect(Object.hasOwn(en, key), key).toBe(true);
        expect(Object.hasOwn(ptBR, key), key).toBe(true);
      }
    }
  });
});

it('covers trend errors, Dependency Rules, statuses and violations', () => {
  for (const key of [
    'trend-error.trend-limit', 'trend-error.unknown-tag', 'trend-error.duplicate-tag', 'trend-error.nothing-selected',
    'dependency-rule.barrel-temperature-window', 'dependency-rule.die-pressure-limit', 'dependency-rule.weld-window', 'dependency-rule.takt-limit',
    'rule-status.pass', 'rule-status.fail', 'rule-status.not-applicable',
    'violation.below-min', 'violation.above-max', 'violation.adjacent-too-far', 'violation.missing',
  ]) {
    expect(Object.hasOwn(en, key), key).toBe(true);
    expect(Object.hasOwn(ptBR, key), key).toBe(true);
  }
});

it('separates button actions from past Event Log entries in both languages', () => {
  expect(en['action.pause']).toBe('Pause');
  expect(en['event-action.pause']).toBe('Line paused');
  expect(en['event-action.setpoint-override']).toBe('Setpoint manually overridden');
  expect(en['shortcut.focus-search']).toBe('Focus the filter or search field');
  expect(ptBR['shortcut.focus-search']).toBe('Focar o campo de filtro ou busca');
  expect(ptBR['action.recipe-new-draft']).toBe('Novo rascunho');
  expect(ptBR['event-action.recipe-new-draft']).toBe('Novo rascunho criado');
  expect(ptBR['tag-status.high']).toBe('Alta');
  expect(ptBR['tag-status.low']).toBe('Baixa');
  expect(ptBR['tag-status.stale']).toBe('Desatualizada');
  expect(ptBR['screen.ledger']).toBe('Registro de lotes de produção');
  expect(ptBR['tour.ledger.note']).toContain('seleção de até 4 itens');
  expect(ptBR['shortcut.open-details']).toContain('item em foco');
  expect(Object.hasOwn(en, 'term.batch-run')).toBe(false);
  expect(JSON.stringify(ptBR)).not.toContain('canhão');
});

it('chooses Event Log value labels by action, never by the value alone', () => {
  for (const [action, value, expected] of [
    ['alarm-acknowledge', 'active-unacknowledged', 'alarm-state.active-unacknowledged'],
    ['alarm-acknowledge', 'cleared', 'alarm-state.cleared'],
    ['shift-handover', 'S1', 'shift.first'], ['shift-handover', 'S2', 'shift.second'],
    ['recipe-approve', 'draft', 'recipe-status.draft'], ['recipe-approve', 'approved', 'recipe-status.approved'],
    ['setpoint-override', 42, null], ['reset-to-recipe', 0, null], ['pause', 'S1', null],
    ['recipe-approve', 'S1', null], ['shift-handover', 'draft', null],
    ['alarm-acknowledge', null, null], ['alarm-acknowledge', 'toString', null],
  ] as const) expect(labels.eventValueLabelKey(action, value)).toBe(expected);
});

it('labels running Batches in both languages', () => {
  expect(labels.batchStatusLabels.running).toBe('batch-status.running');
  expect(en['batch-status.running']).toBe('Running');
  expect(ptBR['batch-status.running']).toBe('Em andamento');
});

it('renders shared Screen messages through the public dictionary', () => {
  const progress: MessageKey = 'deck.batch-progress';
  const params = { produced: 10, target: 20, percent: '50%' };
  expect(t('en', progress, params)).toBe('10 of 20 (50%)');
  expect(t('pt-BR', progress, params)).toBe('10 de 20 (50%)');
  expect(tCount('en', 'common.row-count', 12)).toBe('12 records');
  expect(tCount('pt-BR', 'common.row-count', 12)).toBe('12 registros');
  for (const key of Object.keys(en) as MessageKey[]) {
    const names = [...en[key].matchAll(/\{([a-z]+)\}/g)].map(match => match[1]!);
    const samples = Object.fromEntries(names.map(name => [name, 'sample']));
    expect(t('en', key, samples), key).not.toMatch(/\{[^{}]+\}/);
    expect(t('pt-BR', key, samples), key).not.toMatch(/\{[^{}]+\}/);
  }
});

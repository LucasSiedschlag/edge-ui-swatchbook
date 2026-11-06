import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { raises } from '../sim/alarms';
import { en, ptBR } from './messages';
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
    expect(Object.keys(labels)).toHaveLength(22);
    for (const mapping of Object.values(labels)) {
      for (const key of Object.values(mapping)) {
        expect(Object.hasOwn(en, key), key).toBe(true);
        expect(Object.hasOwn(ptBR, key), key).toBe(true);
      }
    }
  });
});

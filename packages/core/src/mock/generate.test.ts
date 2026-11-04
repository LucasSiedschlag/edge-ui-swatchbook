import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED, generateMockDataset } from './generate';

describe('generateMockDataset determinism', () => {
  it('gives deeply equal output for the same seed', () => {
    expect(generateMockDataset(123)).toEqual(generateMockDataset(123));
  });

  it('gives serialised-identical output for the same seed', () => {
    expect(JSON.stringify(generateMockDataset(DEFAULT_SEED))).toBe(
      JSON.stringify(generateMockDataset(DEFAULT_SEED)),
    );
  });

  it('gives different output for a different seed', () => {
    expect(JSON.stringify(generateMockDataset(1))).not.toBe(JSON.stringify(generateMockDataset(2)));
  });

  it('defaults to DEFAULT_SEED', () => {
    expect(generateMockDataset().seed).toBe(DEFAULT_SEED);
  });
});

describe('translatable text', () => {
  const refs: { key: string; params?: Record<string, unknown> }[] = [];
  const collect = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.key === 'string' && Object.keys(o).every((k) => k === 'key' || k === 'params')) refs.push(o as { key: string; params?: Record<string, unknown> });
      Object.values(o).forEach(collect);
    }
  };
  collect(generateMockDataset());

  it('stores every free text as a dotted lowercase key', () => {
    expect(refs.length).toBeGreaterThan(100);
    for (const r of refs) expect(r.key).toMatch(/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/);
  });

  it('keeps params to strings and numbers', () => {
    for (const r of refs) for (const v of Object.values(r.params ?? {})) expect(['string', 'number']).toContain(typeof v);
  });

  it('leaves identifiers as plain ids, not translation keys', () => {
    const d = generateMockDataset();
    for (const b of d.batches) expect(b.id).toMatch(/^B-[A-Z0-9]+-\d{5}$/);
    for (const t of d.tags) expect(t.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    for (const l of d.lots) expect(l.id).toMatch(/^LOT-[A-Z0-9]+-/);
  });
});

describe('independence between calls', () => {
  it('does not share objects, so changing one dataset leaves the next untouched', () => {
    const a = generateMockDataset();
    const before = JSON.stringify(generateMockDataset());
    (a.areas[0] as { name: { key: string } }).name.key = 'changed';
    (a.lines[0] as { name: { key: string } }).name.key = 'changed';
    (a.products[0] as { name: { key: string } }).name.key = 'changed';
    expect(JSON.stringify(generateMockDataset())).toBe(before);
  });
});

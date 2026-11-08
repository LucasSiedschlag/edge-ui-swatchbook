// @ts-expect-error Node provides fs in tests; the browser package intentionally has no Node type dependency.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import * as core from './index';

it('keeps the Screen specs and registry in exact agreement', () => {
  const files = ['01-operations-live-deck', '02-interactive-recipe-lab', '03-batch-and-lot-ledger', '04-plant-performance-center', '05-live-parameter-matrix', '06-control-room-command'];
  const required = files.flatMap(file => {
    const text: string = readFileSync(new URL(`../../../docs/screens/${file}.md`, import.meta.url), 'utf8');
    const section = text.split('## Required test IDs')[1]!.split('## ')[0]!;
    return [...section.matchAll(/`([a-z]+\.[a-zA-Z0-9-]+)`/g)].map(m => m[1]!);
  });
  const readme: string = readFileSync(new URL('../../../docs/screens/README.md', import.meta.url), 'utf8');
  const shell = readme.split('\n## Shell\n')[1]!.split('\n## ')[0]!;
  const shellIds = [...shell.matchAll(/`(shell\.[a-zA-Z0-9-]+)`/g)].map(m => m[1]!);
  expect(shellIds.length).toBeGreaterThan(0);
  const registered = Object.values(core.TEST_IDS).flatMap(screen => Object.values(screen));
  expect([...registered].sort()).toEqual([...required, ...shellIds].sort());
  expect(new Set(registered).size).toBe(registered.length);
});
it('has fourteen Ledger filter helpers using exactly the view filter names', () => {
  expect(core.LEDGER_FILTER_COLUMNS).toHaveLength(14);
  for (const column of core.LEDGER_FILTER_COLUMNS) {
    expect(core.ledgerFilterId(column)).toBe(`ledger.filter-${column}`);
    expect(Object.values(core.TEST_IDS.ledger)).toContain(core.ledgerFilterId(column));
  }
  expect(core.TEST_IDS.performance.empty).toBe('performance.empty');
  expect(core.TEST_IDS.parameters.gridEmpty).toBe('parameters.grid-empty');
  expect(core.TEST_IDS.parameters.trendEmpty).toBe('parameters.trend-empty');
});
it('names the Shell navigation ids after the Screens', () => {
  for (const screen of core.SCREENS) {
    expect(core.shellNavId(screen.id)).toBe(`shell.nav-${screen.id}`);
    expect(Object.values(core.TEST_IDS.shell)).toContain(core.shellNavId(screen.id));
  }
});

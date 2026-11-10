// @vitest-environment happy-dom
import * as core from '@swatchbook/core';
import {
  LEDGER_DEFAULT_SORT, LEDGER_FILTER_COLUMNS, TEST_IDS, batchDetail, generateMockDataset, ledgerFilterId, ledgerView, t, tCount, tr,
  type LedgerFilterValues, type LedgerSort, type Locale, type MessageKey, type MockDataset,
} from '@swatchbook/core';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ledgerCoverage } from '../../../packages/core/src/i18n/strings/ledger-coverage';
import { byId, choose, click, endMotion, mountApp, one, openSelect, plantState } from './test-utils';

const dataset = generateMockDataset();
const ids = TEST_IDS.ledger;
let app: Awaited<ReturnType<typeof mountApp>> | undefined;
beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });
afterEach(async () => { await app?.unmount(); app = undefined; vi.useRealTimers(); vi.restoreAllMocks(); history.replaceState(null, '', '/'); });
const start = async (locale: Locale = 'en', data: MockDataset = dataset) => { app = await mountApp('#/ledger', { dataset: data, languages: [locale] }); };
const rows = () => [...one(ids.grid).querySelectorAll<HTMLElement>('[data-row-key]')];
const row = (id: string) => rows().find(row => row.dataset.rowKey === id)!;
const rowIds = () => rows().map(row => row.dataset.rowKey!);
const selected = () => [...byId(ids.rowSelect)].filter(el => (el as HTMLInputElement).checked);
const select = (id: string) => click(row(id).querySelector(`[data-testid="${ids.rowSelect}"]`)!);
const action = (id: string) => row(id).querySelector<HTMLButtonElement>('button')!;
const header = (label: string) => [...one(ids.grid).querySelectorAll<HTMLElement>('[role="columnheader"]')].find(el => el.textContent === label)!;
async function input(element: Element, value: string) {
  const target = element instanceof HTMLInputElement ? element : element.querySelector('input')!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, value);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function pick(id: string, label: string) {
  await openSelect(id);
  const dropdown = [...document.querySelectorAll<HTMLElement>('.ant-select-dropdown')].find(el => !el.classList.contains('ant-select-dropdown-hidden'))!;
  const option = [...dropdown.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(el => el.textContent === label);
  if (!option) throw new Error(`missing option ${label}`);
  await click(option);
  // Multi-select stays open natively. Close its popup with Escape before continuing.
  await act(() => { one(id).querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })); });
  await endMotion();
}
async function dateRange(column: 'start' | 'end', from: string, to: string) {
  const inputs = one(ledgerFilterId(column)).querySelectorAll('input');
  await input(inputs[0]!, from);
  await act(() => { inputs[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })); });
  await input(inputs[1]!, to);
  await act(() => { inputs[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })); inputs[1]!.blur(); });
  await endMotion();
}
function expectGrid(filters: LedgerFilterValues = {}, sort: LedgerSort = LEDGER_DEFAULT_SORT, data = dataset) {
  const expected = ledgerView(data, { filters, sort });
  expect(one(ids.rowCount).textContent).toBe(tCount('en', 'common.row-count', expected.rowCount));
  expect(one(ids.grid).getAttribute('aria-rowcount')).toBe(String(expected.rowCount + 1));
  expect(rowIds()).toEqual(expected.rows.slice(0, rows().length).map(row => row.batchId));
  expect(rows().length > 0).toBe(expected.rowCount > 0);
}
async function closeDrawer() {
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  await act(() => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
  await act(() => { dialog.dispatchEvent(new Event('animationend', { bubbles: true })); dialog.dispatchEvent(new Event('transitionend', { bubbles: true })); });
  await endMotion();
}
const description = (element: HTMLElement) => (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean).map(id => document.getElementById(id)!.textContent).join(' ');

it('renders a coherent virtual ARIA table with fixed columns and native density', async () => {
  await start(); expectGrid();
  expect(one(ids.rowCount).textContent).toBe('5,000 records');
  expect(rows().length).toBeLessThan(100);
  expect(one(ids.grid).getAttribute('aria-colcount')).toBe('16');
  expect(one(ids.grid).querySelectorAll('[role="table"]')).toHaveLength(0);
  expect(one(ids.grid).querySelector('table')!.getAttribute('role')).toBe('presentation');
  expect(one(ids.grid).querySelector('thead')!.getAttribute('role')).toBe('rowgroup');
  expect(one(ids.grid).querySelector('thead tr')!.getAttribute('aria-rowindex')).toBe('1');
  rows().forEach((element, index) => {
    expect(element.getAttribute('role')).toBe('row');
    expect(element.getAttribute('aria-rowindex')).toBe(String(index + 2));
    expect(element.querySelectorAll('[role="cell"]')).toHaveLength(16);
    expect(element.querySelectorAll('.ant-table-cell-fix-start').length).toBeGreaterThanOrEqual(2);
    expect(element.querySelector('.ant-table-cell-fix-end')).not.toBeNull();
  });
  expect(one(ids.grid).querySelector('[aria-sort="descending"]')?.textContent).toBe('Start');
  expect(one(ids.grid).querySelector('.ant-table-medium')).not.toBeNull();
  await choose(TEST_IDS.shell.density, 'Compact');
  expect(one(ids.grid).querySelector('.ant-table-small')).not.toBeNull();
  for (const column of LEDGER_FILTER_COLUMNS) expect(byId(ledgerFilterId(column))).toHaveLength(1);
});

const filterCases: { name: keyof LedgerFilterValues; value: LedgerFilterValues; text?: string; choice?: string; number?: string }[] = [
  { name: 'batchId', value: { batchId: 'E1' }, text: 'E1' },
  { name: 'lotId', value: { lotId: 'A1' }, text: 'A1' },
  { name: 'upstreamLotId', value: { upstreamLotId: 'E1' }, text: 'E1' },
  { name: 'areas', value: { areas: ['extrusion'] }, choice: 'Extrusion' },
  { name: 'lines', value: { lines: ['E1'] }, choice: `E1 · ${tr('en', dataset.lines[0]!.name)}` },
  { name: 'products', value: { products: [dataset.products[0]!.id] }, choice: `${dataset.products[0]!.code} · ${tr('en', dataset.products[0]!.name)}` },
  { name: 'shifts', value: { shifts: ['S2'] }, choice: t('en', 'shift.second') },
  { name: 'statuses', value: { statuses: ['rework'] }, choice: 'Rework' },
  { name: 'recipeVersion', value: { recipeVersion: { min: 2 } }, number: '2' },
  { name: 'yield', value: { yield: { min: 98 } }, number: '98' },
  { name: 'scrap', value: { scrap: { min: 20 } }, number: '20' },
  { name: 'duration', value: { duration: { min: 120 } }, number: '120' },
  { name: 'start', value: { start: { fromDate: '2025-12-30', toDate: '2025-12-31' } } },
  { name: 'end', value: { end: { fromDate: '2025-12-30', toDate: '2025-12-31' } } },
];
it.each(filterCases)('filters $name through core and clears back to 5000 records', async ({ name, value, text, choice, number }) => {
  await start();
  const id = ledgerFilterId(name);
  if (text !== undefined) await input(one(id), text);
  else if (choice) await pick(id, choice);
  else if (number) await input(one(id).querySelectorAll('input')[0]!, number);
  else await dateRange(name as 'start' | 'end', '12/30/2025', '12/31/2025');
  expect(ledgerView(dataset, { filters: value }).rowCount).toBeLessThan(5000);
  expectGrid(value);
  await click(one(ids.clearFilters)); expectGrid();
  for (const field of one(ids.grid).parentElement!.querySelectorAll<HTMLInputElement>('input:not([type="checkbox"])')) expect(field.value).toBe('');
});

it('combines choices, text and inclusive numeric bounds, and lists active filter values in the empty state', async () => {
  await start();
  await input(one(ids.filterBatchId), 'E1');
  await pick(ids.filterAreas, 'Extrusion');
  await pick(ids.filterStatuses, 'Completed');
  await input(one(ids.filterRecipeVersion).querySelectorAll('input')[0]!, '2');
  await input(one(ids.filterRecipeVersion).querySelectorAll('input')[1]!, '2');
  await input(one(ids.filterYield).querySelectorAll('input')[0]!, '95');
  await input(one(ids.filterScrap).querySelectorAll('input')[1]!, '20');
  const filters: LedgerFilterValues = { batchId: 'E1', areas: ['extrusion'], statuses: ['completed'], recipeVersion: { min: 2, max: 2 }, yield: { min: 95 }, scrap: { max: 20 } };
  expectGrid(filters);
  await input(one(ids.filterLotId), 'no-such-lot'); expectGrid({ ...filters, lotId: 'no-such-lot' });
  expect(one(ids.rowCount).textContent).toBe('0 records');
  expect(one(ids.empty).textContent).toContain('No Batches match the active filters.');
  for (const expected of ['Active filters', 'Batch ID: E1', 'Lot: no-such-lot', 'Area: Extrusion', 'Status: Completed', 'Recipe Version: From: 2, To: 2', 'Yield percentage: From: 95.0%', 'Scrap count: To: 20']) expect(one(ids.empty).textContent).toContain(expected);
  await click(one(ids.clearFilters)); expectGrid();
});

it('cycles headers ascending, descending and default with controlled aria-sort, including keyboard sort', async () => {
  await start();
  for (const [label, column] of [['Batch ID', 'batchId'], ['Yield percentage', 'yieldPct'], ['Start', 'start']] as const) {
    await click(header(label)); expectGrid({}, { column, direction: 'asc' }); expect(header(label).getAttribute('aria-sort')).toBe('ascending');
    await click(header(label)); expectGrid({}, { column, direction: 'desc' }); expect(header(label).getAttribute('aria-sort')).toBe('descending');
    await click(header(label)); expectGrid(); expect(header('Start').getAttribute('aria-sort')).toBe('descending');
  }
  await act(() => { header('Lot').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })); });
  expectGrid({}, { column: 'lotId', direction: 'asc' });
});

it('retains up to four selections across filters, refuses the fifth, and guards select-all', async () => {
  await start();
  const first = rowIds().slice(0, 5);
  const all = one(ids.grid).querySelector<HTMLInputElement>('thead input')!;
  expect(all.disabled).toBe(true);
  await click(all); expect(selected()).toHaveLength(0);
  await select(first[0]!);
  await input(one(ids.filterBatchId), 'missing');
  expect(document.body.textContent).toContain('1 selected Batch hidden by filters');
  await click(one(ids.clearFilters)); await select(first[0]!);
  for (const id of first.slice(0, 4)) await select(id);
  expect(selected()).toHaveLength(4);
  await select(first[4]!); expect(selected()).toHaveLength(4);
  expect(one(ids.selectionLimit).textContent).toBe('Select at most four Batches.');
  expect(one(ids.selectionLimit).getAttribute('role')).toBe('status');
  expect(one(ids.selectionLimit).classList.contains('ant-alert-warning')).toBe(true);
  await input(one(ids.filterBatchId), 'no-such-batch');
  expect(byId(ids.selectionLimit)).toHaveLength(0);
  expect(document.body.textContent).toContain('4 selected Batches hidden by filters');
  expect(one(ids.compare).getAttribute('aria-disabled')).toBe('false');
  await click(one(ids.clearFilters)); expect(selected()).toHaveLength(4);
  await select(first[0]!); expect(selected()).toHaveLength(3);
  expect(document.body.textContent).toContain('Batch deselected.');
  await select(first[4]!); expect(selected()).toHaveLength(4);
});

it('selects all a small result only when the total including hidden selections fits the core limit', async () => {
  await start();
  await input(one(ids.filterBatchId), rowIds()[0]!);
  let all = one(ids.grid).querySelector<HTMLInputElement>('thead input')!;
  expect(all.disabled).toBe(false); await click(all); expect(selected()).toHaveLength(1);
  await click(one(ids.clearFilters)); expect(selected()).toHaveLength(1);
  expect(one(ids.grid).querySelector<HTMLInputElement>('thead input')!.disabled).toBe(true);
});

it('explains disabled Compare on focus, then compares 2, 3 and 4 Batches with fixed expected values', async () => {
  const errors = vi.spyOn(console, 'error');
  await start();
  expect(one(ids.compare).getAttribute('aria-disabled')).toBe('true');
  expect((one(ids.compare) as HTMLButtonElement).disabled).toBe(false);
  expect(description(one(ids.compare))).toBe('Select 2 to 4 Batches to compare.');
  await act(() => one(ids.compare).focus());
  expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Select 2 to 4 Batches to compare.');
  await click(one(ids.compare)); expect(byId(ids.comparePanel)).toHaveLength(0);
  const first = rowIds().slice(0, 4);
  await select(first[0]!); expect(one(ids.compare).getAttribute('aria-disabled')).toBe('true');
  for (let count = 2; count <= 4; count++) {
    await select(first[count - 1]!);
    expect(one(ids.compare).getAttribute('aria-disabled')).toBe('false');
    await click(one(ids.compare));
    expect(one(ids.comparePanel).textContent).toContain('Batch comparison');
    for (const id of first.slice(0, count)) expect(one(ids.comparePanel).textContent).toContain(id);
    const descriptions = [...one(ids.comparePanel).querySelectorAll('.ant-descriptions')];
    expect(descriptions).toHaveLength(count);
    const metrics = [
      ['B-A1-01150', '1 h 45 min', '97.9%', '1'],
      ['B-A2-01150', '1 h 38 min', '98.6%', '1'],
      ['B-E1-00700', '2 h 44 min', '97.0%', '15'],
      ['B-E2-00700', '2 h 03 min', '95.4%', '15'],
    ];
    descriptions.forEach((element, index) => {
      expect(element.querySelector('.ant-descriptions-title')!.textContent).toBe(metrics[index]![0]);
      expect([...element.querySelectorAll('.ant-descriptions-item-content')].map(cell => cell.textContent)).toEqual(metrics[index]!.slice(1));
    });
    const cycle = one(ids.comparePanel).querySelector('[data-row-key="cycle-time"]')!;
    expect([...cycle.querySelectorAll('td')].map(cell => cell.textContent).slice(2)).toEqual(['110', '112', '-', '-'].slice(0, count));
    if (count >= 3) {
      const barrel = one(ids.comparePanel).querySelector('[data-row-key="barrel-zone-1"]')!;
      expect([...barrel.querySelectorAll('td')].map(cell => cell.textContent).slice(2)).toEqual(['-', '-', '174.3', '177.6'].slice(0, count));
    }
  }
  expect(one(ids.comparePanel).textContent).toContain('Duration');
  expect(one(ids.comparePanel).textContent).toContain('Yield percentage');
  expect(one(ids.comparePanel).textContent).toContain('Scrap count');
  expect(errors.mock.calls).toEqual([]);
});

it('opens details from a row action, suppresses shortcuts, navigates Genealogy and restores focus on Escape', async () => {
  const errors = vi.spyOn(console, 'error');
  await start();
  await input(one(ids.filterBatchId), 'B-A1-01150');
  const button = action('B-A1-01150'); await act(() => button.focus()); await click(button);
  expect(one(ids.drawer).textContent).toContain('B-A1-01150');
  expect(one(ids.drawer).querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
  await act(() => { document.querySelector('[role="dialog"]')!.dispatchEvent(new Event('animationend', { bubbles: true })); });
  const detail = batchDetail(plantState(), 0, 'B-A1-01150');
  if ('error' in detail) throw new Error(detail.error);
  expect(one(ids.drawerParameters).querySelectorAll('tbody [data-row-key]')).toHaveLength(detail.parameters.length);
  expect(one(ids.drawerAlarms).querySelectorAll('tbody [data-row-key]')).toHaveLength(detail.alarms.length);
  expect(one(ids.drawerParameters).textContent).toContain('Actual');
  expect(one(ids.drawerParameters).textContent).toContain('Setpoint');
  const cycle = [...one(ids.drawerParameters).querySelectorAll('tbody tr')].find(element => element.querySelector('td')?.textContent === 'Cycle time')!;
  expect([...cycle.querySelectorAll('td')].map(cell => cell.textContent)).toEqual(['Cycle time', '110', '109', '0.9%', '60', '119', 's', 'Within limits']);
  await act(() => {
    one(ids.drawer).focus();
    one(ids.drawer).dispatchEvent(new KeyboardEvent('keydown', { key: '6', bubbles: true }));
    one(ids.drawer).dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
  });
  expect(location.hash).toBe('#/ledger');
  expect(document.activeElement).not.toBe(one(ids.filterBatchId));
  const target = detail.genealogy.find(node => node.linked && node.batchId !== detail.header.batchId)!;
  const link = [...one(ids.drawerGenealogy).querySelectorAll('a')].find(link => link.textContent === target.batchId)!;
  await click(link);
  expect(one(ids.drawer).querySelector('.ant-descriptions')!.textContent).toContain(target.batchId);
  expect(one(ids.drawer).querySelector('.ant-descriptions')!.textContent).not.toContain('B-A1-01150');
  const nextDetail = batchDetail(plantState(), 0, target.batchId!);
  if ('error' in nextDetail) throw new Error(nextDetail.error);
  expect(one(ids.drawerParameters).querySelectorAll('tbody [data-row-key]')).toHaveLength(nextDetail.parameters.length);
  expect(one(ids.drawerAlarms).querySelectorAll('tbody [data-row-key]')).toHaveLength(nextDetail.alarms.length);
  await closeDrawer();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(button);
  expect(errors.mock.calls).toEqual([]);
});

it('opens a focused row with Enter and returns focus to it', async () => {
  await start(); const element = rows()[0]!;
  await act(() => { element.focus(); element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  expect(one(ids.drawer).textContent).toContain(element.dataset.rowKey);
  await closeDrawer(); expect(document.activeElement).toBe(element);
});

it('renders Portuguese controls and decimal ranges without object-valued Select DOM attributes', async () => {
  await start('pt-BR');
  expect(one(ids.grid).querySelector('thead input')?.getAttribute('aria-label')).toBe('Selecionar todos os lotes de produção visíveis (máximo quatro)');
  const field = one(ids.filterDuration).querySelector('input')!;
  for (const value of ['2', '2,', '2,5']) await input(field, value);
  expect(field.value).toBe('2,5');
  expect(one(ids.grid).getAttribute('aria-rowcount')).toBe(String(ledgerView(dataset, { filters: { duration: { min: 2.5 } } }).rowCount + 1));
  for (const id of [ids.filterAreas, ids.filterLines, ids.filterProducts, ids.filterShifts, ids.filterStatuses]) {
    await openSelect(id);
    expect(document.body.innerHTML).not.toContain('[object Object]');
    await act(() => { one(id).querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })); });
  }
  await dateRange('start', '30/12/2025', '31/12/2025');
  expect(one(ids.grid).getAttribute('aria-rowcount')).toBe(String(ledgerView(dataset, { filters: { duration: { min: 2.5 }, start: { fromDate: '2025-12-30', toDate: '2025-12-31' } } }).rowCount + 1));
  expect(document.body.textContent).not.toContain('[[');
});

it('does not recompute the historical ledger view on clock ticks', async () => {
  const viewSpy = vi.spyOn(core, 'ledgerView'); vi.useFakeTimers(); let clock = 0;
  app = await mountApp('#/ledger', { dataset, search: '', now: () => clock });
  const calls = viewSpy.mock.calls.length;
  const first = rows()[0]!;
  clock = 3000; await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
  expect(viewSpy.mock.calls).toHaveLength(calls); expect(rows()[0]).toBe(first);
});

it.each(['en', 'pt-BR'] as const)('renders every Ledger manifest key, including empty and defensive states, in %s', async locale => {
  const keys = new Set<MessageKey>([...Object.values(ledgerCoverage.shows), ...Object.values(ledgerCoverage.actions), ...Object.values(ledgerCoverage.states)].flat());
  const seen = new Set<MessageKey>();
  const capture = () => {
    const rendered = [document.body.textContent ?? '', ...[...document.querySelectorAll('*')].flatMap(el => ['aria-label', 'placeholder', 'title'].map(attribute => el.getAttribute(attribute) ?? ''))].join('\n');
    for (const key of keys) {
      const pattern = t(locale, key).split(/\{[^}]+\}/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+?');
      if (new RegExp(pattern).test(rendered)) seen.add(key);
    }
  };
  async function hover(element: HTMLElement) {
    await act(async () => { (element.querySelector('.ant-table-column-sorters') ?? element).dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 160)); }); capture();
    await act(() => { (element.querySelector('.ant-table-column-sorters') ?? element).dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); });
    await endMotion();
  }
  await start(locale); capture();
  const batchHeader = header(t(locale, 'common.batch-id'));
  await hover(batchHeader); await click(batchHeader); await hover(batchHeader); await click(batchHeader); await hover(batchHeader); await click(batchHeader);
  const first = rowIds().slice(0, 5);
  for (const id of first.slice(0, 4)) { await select(id); capture(); }
  await select(first[4]!); capture();
  await click(one(ids.compare)); capture();
  await select(first[0]!); capture();
  await input(one(ids.filterBatchId), 'missing'); capture();
  await click(one(ids.clearFilters));
  await input(one(ids.filterBatchId), 'B-A1-01150');
  await click(action('B-A1-01150')); capture();
  await closeDrawer();
  await app!.unmount(); app = undefined;
  // Empty Genealogy and Parameters and an out-of-limit actual are valid core detail shapes.
  const source = dataset.batches.find(batch => batch.id === 'B-A1-01150')!;
  const altered = { ...dataset, genealogies: [], alarms: [], batches: dataset.batches.map(batch => batch.id === source.id ? { ...source, actuals: Object.fromEntries(Object.keys(source.actuals).map(key => [key, 999999])) } : batch) };
  await start(locale, altered); await input(one(ids.filterBatchId), source.id); await click(action(source.id)); capture(); await closeDrawer();
  await app!.unmount(); app = undefined;
  await start(locale, { ...altered, recipeVersions: dataset.recipeVersions.map(version => ({ ...version, steps: [] })) });
  await input(one(ids.filterBatchId), source.id); await click(action(source.id)); capture(); await closeDrawer();
  vi.spyOn(core, 'batchDetail').mockReturnValue({ error: 'unknown-batch' });
  await click(action(source.id)); capture();
  expect([...keys].filter(key => !seen.has(key))).toEqual([]);
});

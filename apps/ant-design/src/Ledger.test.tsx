// @vitest-environment happy-dom
import {
  LEDGER_FILTER_COLUMNS, TEST_IDS, generateMockDataset, ledgerFilterId, t,
  type LedgerFilterValues, type Locale, type MessageKey, type MockDataset,
} from '@swatchbook/core';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ledgerCoverage } from '../../../packages/core/src/i18n/strings/ledger-coverage';
import { byId, choose, click, endMotion, mountApp, one, openSelect } from './test-utils';

const dataset = generateMockDataset();
const ids = TEST_IDS.ledger;
let app: Awaited<ReturnType<typeof mountApp>> | undefined;
beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; vi.spyOn(console, 'error'); });
afterEach(async () => { await app?.unmount(); app = undefined; expect(vi.mocked(console.error).mock.calls).toEqual([]); vi.useRealTimers(); vi.restoreAllMocks(); history.replaceState(null, '', '/'); });
const start = async (locale: Locale = 'en', data: MockDataset = dataset) => { app = await mountApp('#/ledger', { dataset: data, languages: [locale] }); };
const rows = () => [...one(ids.grid).querySelectorAll<HTMLElement>('[role="row"]')].filter(row => row.querySelector('[data-testid="ledger.row-select"]'));
const row = (id: string) => rows().find(row => [...row.querySelectorAll('[role="cell"]')].some(cell => cell.textContent === id))!;
const rowIds = () => rows().map(row => row.querySelector('[role="cell"]:nth-child(2)')!.textContent!);
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
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(el => el.textContent === label);
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
// Seed 20260101: read the raw Batch/Lot/Recipe records once, tally the matches,
// and order by recorded start (Batch ID breaks ties). No Screen/core view oracle.
const defaultFirst = ['B-A1-01150', 'B-A2-01150', 'B-E1-00700'];
const firstFour = ['B-A1-01150', 'B-A2-01150', 'B-E1-00700', 'B-E2-00700'];
const firstFive = [...firstFour, 'B-A1-01149'];
const recordCounts: Record<number, string> = {
  0: '0 records', 1: '1 record', 5: '5 records', 55: '55 records', 56: '56 records',
  112: '112 records', 152: '152 records', 305: '305 records', 624: '624 records',
  700: '700 records', 952: '952 records', 1150: '1,150 records', 1216: '1,216 records',
  1284: '1,284 records', 1400: '1,400 records', 1681: '1,681 records', 1927: '1,927 records',
  2244: '2,244 records', 5000: '5,000 records',
};
const portugueseCounts: Record<number, string> = { 5: '5 registros', 112: '112 registros', 5000: '5.000 registros' };
function expectGrid(count = 5000, first = defaultFirst, locale: Locale = 'en') {
  expect(one(ids.rowCount).textContent).toBe((locale === 'en' ? recordCounts : portugueseCounts)[count]);
  expect(one(ids.grid).getAttribute('aria-rowcount')).toBe(String(count === 0 ? 2 : count + 1));
  expect(rowIds().slice(0, first.length)).toEqual(first);
  expect(rows().length > 0).toBe(count > 0);
}
function namedSection(name: string, scope: Element): HTMLElement {
  let element = [...scope.querySelectorAll<HTMLElement>('*')].find(el => el.textContent === name && ![...el.children].some(child => child.textContent === name))!;
  while (!element.querySelector('table')) element = element.parentElement!;
  return element;
}
const tableRow = (scope: Element, label: string) => [...scope.querySelectorAll('tr')].find(row => [...row.querySelectorAll('*')].some(cell => cell.textContent === label))!;
const cellTexts = (row: Element) => [...row.querySelectorAll('td')].map(cell => cell.textContent);
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
    expect(element.tabIndex).toBe(-1);
    expect(element.getAttribute('aria-rowindex')).toBe(String(index + 2));
    expect(element.querySelectorAll('[role="cell"]')).toHaveLength(16);
  });
  expect(one(ids.grid).querySelector('[aria-sort="descending"]')?.textContent).toBe('Start');
  await choose(TEST_IDS.shell.density, 'Compact');
  expectGrid();
  expect(rows()[0]!.querySelectorAll('[role="cell"]')).toHaveLength(16);
  for (const column of LEDGER_FILTER_COLUMNS) expect(byId(ledgerFilterId(column))).toHaveLength(1);
});

const filterCases = [
  { name: 'batchId', text: 'E1', count: 700, first: ['B-E1-00700', 'B-E1-00699', 'B-E1-00698'] },
  { name: 'lotId', text: 'A1', count: 1150, first: ['B-A1-01150', 'B-A1-01149', 'B-A1-01148'] },
  { name: 'upstreamLotId', text: 'E1', count: 1216, first: ['B-A2-01150', 'B-A1-01149', 'B-A2-01149'] },
  { name: 'areas', choice: 'Extrusion', count: 1400, first: ['B-E1-00700', 'B-E2-00700', 'B-E1-00699'] },
  { name: 'lines', choice: 'E1 · Extrusion Line 1', count: 700, first: ['B-E1-00700', 'B-E1-00699', 'B-E1-00698'] },
  { name: 'products', choice: 'WIN-1L-60 · Single-leaf window (WIN-1L-60)', count: 624, first: ['B-A2-01150', 'B-E1-00699', 'B-P1-00400'] },
  { name: 'shifts', choice: 'Shift 2', count: 1681, first: ['B-A1-01147', 'B-P1-00400', 'B-A2-01147'] },
  { name: 'statuses', choice: 'Rework', count: 305, first: ['B-A2-01136', 'B-A1-01133', 'B-E1-00691'] },
  { name: 'recipeVersion', number: '2', count: 1927, first: ['B-A1-01150', 'B-E1-00700', 'B-A2-01149'] },
  { name: 'yield', number: '98', count: 1284, first: ['B-A2-01150', 'B-A1-01148', 'B-E1-00699'] },
  { name: 'scrap', number: '20', count: 952, first: ['B-RF1-00500', 'B-P1-00400', 'B-E1-00698'] },
  { name: 'duration', number: '120', count: 2244, first: ['B-E1-00700', 'B-E2-00700', 'B-RF1-00500'] },
  { name: 'start', count: 112, first: ['B-RF1-00500', 'B-A1-01148', 'B-E1-00699'] },
  { name: 'end', count: 112, first: ['B-A1-01147', 'B-A2-01147', 'B-A1-01146'] },
] satisfies { name: keyof LedgerFilterValues; text?: string; choice?: string; number?: string; count: number; first: string[] }[];
it.each(filterCases)('filters $name and clears back to 5000 records', async test => {
  await start();
  const id = ledgerFilterId(test.name);
  if ('text' in test) await input(one(id), test.text!);
  else if ('choice' in test) await pick(id, test.choice!);
  else if ('number' in test) await input(one(id).querySelectorAll('input')[0]!, test.number!);
  else await dateRange(test.name as 'start' | 'end', '12/30/2025', '12/31/2025');
  expectGrid(test.count, test.first);
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
  expectGrid(152, ['B-E1-00700', 'B-E1-00699', 'B-E1-00695']);
  await input(one(ids.filterLotId), 'no-such-lot'); expectGrid(0, []);
  expect(one(ids.rowCount).textContent).toBe('0 records');
  expect(one(ids.empty).textContent).toContain('No Batches match the active filters.');
  for (const expected of ['Active filters', 'Batch ID: E1', 'Lot: no-such-lot', 'Area: Extrusion', 'Status: Completed', 'Recipe Version: From: 2, To: 2', 'Yield percentage: From: 95.0%', 'Scrap count: To: 20']) expect(one(ids.empty).textContent).toContain(expected);
  await click(one(ids.clearFilters)); expectGrid();
});

it('cycles headers ascending, descending and default with controlled aria-sort, including keyboard sort', async () => {
  await start();
  for (const [label, ascending, descending] of [
    ['Batch ID', ['B-A1-00001', 'B-A1-00002', 'B-A1-00003'], ['B-RF1-00500', 'B-RF1-00499', 'B-RF1-00498']],
    ['Yield percentage', ['B-A2-00329', 'B-A2-00425', 'B-P1-00112'], ['B-A1-00020', 'B-A1-00171', 'B-A1-00192']],
    ['Start', ['B-A2-00001', 'B-RF1-00001', 'B-A1-00001'], defaultFirst],
  ] as const) {
    await click(header(label)); expectGrid(5000, [...ascending]); expect(header(label).getAttribute('aria-sort')).toBe('ascending');
    await click(header(label)); expectGrid(5000, [...descending]); expect(header(label).getAttribute('aria-sort')).toBe('descending');
    await click(header(label)); expectGrid(); expect(header('Start').getAttribute('aria-sort')).toBe('descending');
  }
  await act(() => { header('Lot').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })); });
  expectGrid(5000, ['B-A1-00001', 'B-A1-00002', 'B-A1-00003']);
});

it('retains up to four selections across filters, refuses the fifth, and guards select-all', async () => {
  await start();
  const first = firstFive;
  const all = one(ids.grid).querySelector<HTMLInputElement>('input[aria-label="Select all visible Batches (maximum four)"]')!;
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
  const refusal = one(ids.selectionLimit);
  await select(first[4]!);
  expect(one(ids.selectionLimit)).not.toBe(refusal);
  await input(one(ids.filterBatchId), 'no-such-batch');
  expect(byId(ids.selectionLimit)).toHaveLength(0);
  expect(document.body.textContent).toContain('4 selected Batches hidden by filters');
  expect(one(ids.compare).getAttribute('aria-disabled')).toBe('false');
  await click(one(ids.clearFilters)); expect(selected()).toHaveLength(4);
  await select(first[0]!); expect(selected()).toHaveLength(3);
  expect(document.body.textContent).toContain('Batch deselected.');
  await select(first[4]!); expect(selected()).toHaveLength(4);
});

it('reports Shift-click selection and limit refusals, and returns focus when selection clears Compare', async () => {
  await start();
  const first = firstFive;
  await select(first[0]!);
  const shiftSelect = (id: string) => act(() => {
    row(id).querySelector('input')!.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
  });
  await shiftSelect(first[2]!);
  expect(selected()).toHaveLength(3);
  expect([...document.querySelectorAll('[role="status"]')].find(el => el.textContent === 'Batch selected.')?.textContent).toBe('Batch selected.');
  await click(one(ids.compare));
  expect(document.activeElement).toBe(one(ids.comparePanel));
  await shiftSelect(first[4]!);
  expect(selected()).toHaveLength(3);
  expect(one(ids.selectionLimit).textContent).toBe('Select at most four Batches.');
  expect(byId(ids.comparePanel)).toHaveLength(1);
  await select(first[0]!);
  expect(byId(ids.comparePanel)).toHaveLength(0);
  expect(document.activeElement).toBe(one(ids.compare));
});

it('selects all a small result only when the total including hidden selections fits the core limit', async () => {
  await start();
  await input(one(ids.filterBatchId), 'B-A1-01150');
  let all = one(ids.grid).querySelector<HTMLInputElement>('thead input')!;
  expect(all.disabled).toBe(false); await click(all); expect(selected()).toHaveLength(1);
  await click(one(ids.clearFilters)); expect(selected()).toHaveLength(1);
  expect(one(ids.grid).querySelector<HTMLInputElement>('thead input')!.disabled).toBe(true);
});

it('explains disabled Compare on focus, then compares 2, 3 and 4 Batches with fixed expected values', async () => {
  const errors = vi.spyOn(console, 'error');
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
  await start();
  expect(one(ids.compare).getAttribute('aria-disabled')).toBe('true');
  expect((one(ids.compare) as HTMLButtonElement).disabled).toBe(false);
  expect(description(one(ids.compare))).toBe('Select 2 to 4 Batches to compare.');
  await act(() => one(ids.compare).focus());
  expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Select 2 to 4 Batches to compare.');
  await click(one(ids.compare)); expect(byId(ids.comparePanel)).toHaveLength(0);
  const first = firstFour;
  await select(first[0]!); expect(one(ids.compare).getAttribute('aria-disabled')).toBe('true');
  for (let count = 2; count <= 4; count++) {
    await select(first[count - 1]!);
    expect(one(ids.compare).getAttribute('aria-disabled')).toBe('false');
    await click(one(ids.compare));
    expect(one(ids.comparePanel).textContent).toContain('Batch comparison');
    expect(document.activeElement).toBe(one(ids.comparePanel));
    expect(scroll.mock.contexts).toContain(one(ids.comparePanel));
    for (const id of first.slice(0, count)) expect(one(ids.comparePanel).textContent).toContain(id);
    const metrics = [
      ['B-A1-01150', '1 h 45 min', '97.9%', '1'],
      ['B-A2-01150', '1 h 38 min', '98.6%', '1'],
      ['B-E1-00700', '2 h 44 min', '97.0%', '15'],
      ['B-E2-00700', '2 h 03 min', '95.4%', '15'],
    ];
    for (const metric of metrics.slice(0, count)) {
      const section = namedSection(metric[0]!, one(ids.comparePanel));
      expect(cellTexts(tableRow(section, 'Duration'))).toEqual([`Duration${metric[1]}`]);
      expect(cellTexts(tableRow(section, 'Yield percentage'))).toEqual([`Yield percentage${metric[2]}`]);
      expect(cellTexts(tableRow(section, 'Scrap count'))).toEqual([`Scrap count${metric[3]}`]);
    }
    const parameterTable = [...one(ids.comparePanel).querySelectorAll('table')].find(table => table.querySelector('th')?.textContent === 'Parameter')!;
    expect([...parameterTable.querySelectorAll('th')].map(cell => cell.textContent)).toEqual(['Parameter', 'Unit', ...first.slice(0, count)]);
    expect(cellTexts(tableRow(parameterTable, 'Cycle time')).slice(2)).toEqual(['110', '112', '-', '-'].slice(0, count));
    if (count >= 3) expect(cellTexts(tableRow(parameterTable, 'Barrel zone 1')).slice(2)).toEqual(['-', '-', '174.3', '177.6'].slice(0, count));
  }
  expect(one(ids.comparePanel).textContent).toContain('Duration');
  expect(one(ids.comparePanel).textContent).toContain('Yield percentage');
  expect(one(ids.comparePanel).textContent).toContain('Scrap count');
  await click(one(ids.comparePanel).querySelector('button')!);
  expect(byId(ids.comparePanel)).toHaveLength(0);
  expect(document.activeElement).toBe(one(ids.compare));
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
  expect(one(ids.drawerParameters).querySelectorAll('tbody tr')).toHaveLength(3);
  expect(one(ids.drawerAlarms).textContent).toContain('No Alarms raised during this run.');
  expect(one(ids.drawerParameters).textContent).toContain('Actual');
  expect(one(ids.drawer).querySelectorAll('button[aria-label="Close"]')).toHaveLength(1);
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
  const link = [...one(ids.drawerGenealogy).querySelectorAll('a')].find(link => link.textContent === 'B-E2-00659')!;
  await click(link);
  expect(one(ids.drawer).textContent).toContain('LOT-E2-00659');
  expect(document.activeElement?.textContent).toBe('Batch details · B-E2-00659');
  expect(one(ids.drawer).textContent).not.toContain('B-A1-01150');
  expect(one(ids.drawerParameters).querySelectorAll('tbody tr')).toHaveLength(8);
  expect(one(ids.drawerAlarms).textContent).toContain('No Alarms raised during this run.');
  expect(cellTexts(tableRow(one(ids.drawerParameters), 'Barrel zone 1'))).toEqual(['Barrel zone 1', '173.2', '174.0', '-0.4%', '165.0', '195.0', '°C', 'Within limits']);
  await closeDrawer();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(button);
  expect(errors.mock.calls).toEqual([]);
});

it('opens a focused row with Enter and returns focus to it', async () => {
  await start(); const element = row('B-A1-01150');
  await act(() => { element.focus(); element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  expect(one(ids.drawer).textContent).toContain('Batch details · B-A1-01150');
  await closeDrawer(); expect(document.activeElement).toBe(element);
});

it('renders Portuguese controls and decimal ranges without object-valued Select DOM attributes', async () => {
  await start('pt-BR');
  expect(one(ids.grid).querySelector('thead input')?.getAttribute('aria-label')).toBe('Selecionar todos os lotes de produção visíveis (máximo quatro)');
  const field = one(ids.filterDuration).querySelector('input')!;
  for (const value of ['2', '2,', '2,5']) await input(field, value);
  expect(field.value).toBe('2,5');
  expectGrid(5000, defaultFirst, 'pt-BR');
  for (const id of [ids.filterAreas, ids.filterLines, ids.filterProducts, ids.filterShifts, ids.filterStatuses]) {
    await openSelect(id);
    expect(document.body.innerHTML).not.toContain('[object Object]');
    await act(() => { one(id).querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })); });
  }
  await dateRange('start', '30/12/2025', '31/12/2025');
  expectGrid(112, ['B-RF1-00500', 'B-A1-01148', 'B-E1-00699'], 'pt-BR');
  expect(document.body.textContent).not.toContain('[[');
});

it('updates a running Batch drawer to its known completion while history stays visible', async () => {
  // A valid Genealogy link exposes the seeded running Batch through the Screen.
  const data = { ...dataset, genealogies: dataset.genealogies.map(chain => chain.lotId === 'LOT-A1-01150'
    ? { ...chain, assembly: { lotId: 'LOT-A1-01151', batchId: 'B-A1-01151', serial: 'SN-A1-001151' } } : chain) };
  vi.useFakeTimers(); let clock = 0;
  app = await mountApp('#/ledger', { dataset: data, search: '', now: () => clock });
  await click(action('B-A1-01150'));
  await click([...one(ids.drawerGenealogy).querySelectorAll('a')].find(link => link.textContent === 'B-A1-01151')!);
  expect(one(ids.drawer).textContent).toContain('Running');
  expect(one(ids.drawer).textContent).not.toContain('01/01/2026 06:48');
  // 23 remaining units at 0.475 units/min complete at tick 2906: 06:48 local.
  clock = 3_000_000; await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(one(ids.drawer).textContent).toContain('Completed');
  expect(one(ids.drawer).textContent).toContain('01/01/2026 06:48');
  expect(one(ids.drawer).getAttribute('aria-live')).toBeNull();
  expect(cellTexts(tableRow(one(ids.drawerParameters), 'Cycle time'))).toEqual(['Cycle time', '-', '112', 'Unknown', '60', '119', 's', 'Unknown']);
  expectGrid();
});

it('remounts repeated informational confirmations and keeps the historical content', async () => {
  await start();
  await select('B-A1-01150');
  const notice = [...document.querySelectorAll('[role="status"]')].find(el => el.textContent === 'Batch selected.')!;
  expect(notice).toBeDefined();
  await select('B-A2-01150');
  const next = [...document.querySelectorAll('[role="status"]')].find(el => el.textContent === 'Batch selected.')!;
  expect(next).toBeDefined();
  expect(next).not.toBe(notice); // Explicit repeated-announcement requirement.
  expectGrid();
  expect(selected().map(el => el.getAttribute('aria-label'))).toEqual(['Select Batch B-A1-01150', 'Select Batch B-A2-01150']);
});

it.each(['en', 'pt-BR'] as const)('names filters and both date inputs distinctly in %s, and keeps search outside Collapse', async locale => {
  await start(locale);
  const names = locale === 'en' ? [
    'Filter Batch ID', 'Filter Lot', 'Filter Upstream Lot', 'Filter Area', 'Filter Line', 'Filter Product', 'Filter Recipe Version',
    'Filter Shift', 'Filter Start', 'Filter End', 'Filter Duration (min)', 'Filter Status', 'Filter Yield percentage', 'Filter Scrap count',
  ] : [
    'Filtrar ID do lote de produção', 'Filtrar Lote rastreável', 'Filtrar Lote rastreável de origem', 'Filtrar Área', 'Filtrar Linha', 'Filtrar Produto',
    'Filtrar Versão da receita', 'Filtrar Turno', 'Filtrar Início', 'Filtrar Fim', 'Filtrar Duração (min)', 'Filtrar Status', 'Filtrar Rendimento percentual', 'Filtrar Quantidade de refugo',
  ];
  for (const [index, column] of LEDGER_FILTER_COLUMNS.entries()) {
    const wrapper = one(ledgerFilterId(column));
    const element = wrapper.hasAttribute('aria-label') ? wrapper : wrapper.querySelector('[aria-label]')!;
    expect(element.getAttribute('aria-label')).toBe(names[index]);
  }
  for (const column of ['start', 'end'] as const) {
    const group = one(ledgerFilterId(column));
    expect(group.getAttribute('role')).toBe('group');
    expect([...group.querySelectorAll('input')].map(field => field.getAttribute('aria-label') ?? field.placeholder)).toEqual(locale === 'en' ? ['From', 'To'] : ['De', 'Até']);
  }
  const selectAllLabel = locale === 'en' ? 'Select all visible Batches (maximum four)' : 'Selecionar todos os lotes de produção visíveis (máximo quatro)';
  const selectAll = [...one(ids.grid).querySelectorAll('input')].find(field => field.getAttribute('aria-label') === selectAllLabel)!;
  expect(selectAll.closest('[title]')!.getAttribute('title')).toBe(selectAllLabel);
  const toggle = [...document.querySelectorAll<HTMLElement>('[role="button"]')].find(el => el.textContent === (locale === 'en' ? 'Filter0 active filters' : 'Filtrar0 filtros ativos'))!;
  const collapse = toggle.parentElement!;
  expect(collapse.contains(one(ids.filterBatchId))).toBe(false);
  await click(toggle);
  for (const column of LEDGER_FILTER_COLUMNS) expect(byId(ledgerFilterId(column))).toHaveLength(1);
  await act(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })));
  expect(document.activeElement).toBe(one(ids.filterBatchId));
  expect(collapse.contains(one(ids.clearFilters))).toBe(false);
  expect(collapse.contains(one(ids.rowCount))).toBe(false);
});

it.each(['1e400', '-'])('treats invalid range input %s as empty in both bounds of every numeric filter', async value => {
  await start();
  for (const id of [ids.filterRecipeVersion, ids.filterYield, ids.filterScrap, ids.filterDuration]) {
    for (const bound of [0, 1]) {
      await click(one(ids.clearFilters));
      const field = one(id).querySelectorAll('input')[bound]!;
      await input(field, '2');
      await input(field, value);
      expectGrid();
    }
  }
});

it.each(['en', 'pt-BR'] as const)('renders every Ledger manifest key, including empty states, in %s', async locale => {
  const keys = new Set<MessageKey>([...Object.values(ledgerCoverage.shows), ...Object.values(ledgerCoverage.actions), ...Object.values(ledgerCoverage.states)].flat());
  const seen = new Set<MessageKey>();
  const capture = () => {
    const rendered = [...document.querySelectorAll('*')].flatMap(el => [
      ...(![...el.children].some(child => child.textContent === el.textContent) ? [el.textContent ?? ''] : []),
      ...['aria-label', 'placeholder', 'title'].map(attribute => el.getAttribute(attribute) ?? ''),
    ]);
    for (const key of keys) {
      const expected = t(locale, key, {
        count: key === 'common.row-count.other' ? (locale === 'en' ? '5,000' : '5.000') : key === 'ledger.selected-hidden.other' ? 3 : 0,
        batch: 'B-A1-01150', column: t(locale, 'common.batch-id'),
      });
      if (rendered.includes(expected)) seen.add(key);
    }
  };
  async function hover(element: HTMLElement) {
    const label = [...element.querySelectorAll('span')].find(el => el.textContent === element.textContent && el.children.length === 0)!;
    await act(async () => { label.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 160)); }); capture();
    await act(() => { label.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); });
    await endMotion();
  }
  await start(locale); capture();
  const batchHeader = header(t(locale, 'common.batch-id'));
  await hover(batchHeader); await click(batchHeader); await hover(batchHeader); await click(batchHeader); await hover(batchHeader); await click(batchHeader);
  const first = firstFive;
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
  expect([...keys].filter(key => !seen.has(key))).toEqual([]);
});

it('searches choice filters by their displayed labels in English and Portuguese', async () => {
  for (const [locale, area, status] of [['pt-BR', 'Montagem', 'Concluído'], ['en', 'Assembly', 'Completed']] as const) {
    await start(locale);
    for (const [id, label] of [[ids.filterAreas, area], [ids.filterStatuses, status]] as const) {
      await openSelect(id);
      await input(one(id), label);
      expect([...document.querySelectorAll('[role="option"]')].map(option => option.textContent)).toContain(label);
      await act(() => one(id).querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })));
    }
    await app!.unmount(); app = undefined;
  }
});

it('keeps the empty placeholder in an explicit table rowgroup with coherent row and column counts', async () => {
  await start();
  await input(one(ids.filterBatchId), 'no-such-batch');
  const empty = one(ids.empty);
  const group = empty.closest('[role="rowgroup"]');
  expect(group).not.toBeNull();
  expect(one(ids.grid).contains(group)).toBe(true);
  expect(empty.closest('[role="cell"]')?.getAttribute('aria-colspan')).toBe('16');
  expect(empty.closest('[role="row"]')?.getAttribute('aria-rowindex')).toBe('2');
  expect(one(ids.grid).getAttribute('aria-colcount')).toBe('16');
  expect(one(ids.grid).getAttribute('aria-rowcount')).toBe('2');
  expect(one(ids.rowCount).textContent).toBe('0 records');
  expect(empty.textContent).toContain('Batch ID: no-such-batch');
});

it('accepts only integer Recipe Version bounds and describes the committed values exactly', async () => {
  await start();
  const fields = one(ids.filterRecipeVersion).querySelectorAll('input');
  await input(fields[0]!, '1.4');
  await act(() => fields[0]!.blur());
  expect(fields[0]!.value).toBe('1');
  await input(fields[1]!, '1.6');
  await act(() => fields[1]!.blur());
  expect(fields[1]!.value).toBe('2');
  await input(one(ids.filterBatchId), 'missing');
  expect(one(ids.empty).textContent).toContain('Recipe Version: From: 1, To: 2');
});

it('filters Start and End by a whole São Paulo date using real Batches near midnight', async () => {
  await start();
  // Seeded End: A2-01135 ends 02:57:40Z (before local Dec 31),
  // P1-00395 ends 03:45:26Z (inside), A1-01148 ends on local Jan 1.
  // Start: A1-01134 starts 02:50:08Z; E2-00692 starts 03:26:36Z.
  for (const test of [
    { column: 'end' as const, count: 55, first: ['B-A1-01147', 'B-A2-01147', 'B-A1-01146'], before: 'B-A2-01135', inside: 'B-P1-00395', after: 'B-A1-01148' },
    { column: 'start' as const, count: 56, first: ['B-RF1-00500', 'B-A1-01148', 'B-E1-00699'], before: 'B-A1-01134', inside: 'B-E2-00692', after: 'B-A1-01149' },
  ]) {
    await click(one(ids.clearFilters));
    await dateRange(test.column, '12/31/2025', '12/31/2025');
    expectGrid(test.count, test.first);
    await input(one(ids.filterBatchId), test.before); expectGrid(0, []);
    await input(one(ids.filterBatchId), test.inside); expectGrid(1, [test.inside]);
    await input(one(ids.filterBatchId), test.after); expectGrid(0, []);
  }
});

it('counts two hidden selections toward four, refuses a fifth and restores the original checks', async () => {
  await start();
  await select('B-A1-01150'); await select('B-A2-01150');
  await input(one(ids.filterBatchId), 'B-E');
  expect(document.body.textContent).toContain('2 selected Batches hidden by filters');
  const all = one(ids.grid).querySelector<HTMLInputElement>('input[aria-label="Select all visible Batches (maximum four)"]')!;
  expect(all.disabled).toBe(true);
  await click(all); expect(selected()).toHaveLength(0);
  await select('B-E1-00700'); await select('B-E2-00700');
  expect(document.body.textContent).toContain('4 selected');
  expect(selected().map(el => el.getAttribute('aria-label'))).toEqual(['Select Batch B-E1-00700', 'Select Batch B-E2-00700']);
  await select('B-E1-00699');
  expect(one(ids.selectionLimit).textContent).toBe('Select at most four Batches.');
  expect((row('B-E1-00699').querySelector('input') as HTMLInputElement).checked).toBe(false);
  expect(document.body.textContent).toContain('4 selected');
  // Remove the two additions; the original hidden choices must survive untouched.
  await select('B-E1-00700'); await select('B-E2-00700');
  await click(one(ids.clearFilters));
  expect(selected().map(el => el.getAttribute('aria-label'))).toEqual(['Select Batch B-A1-01150', 'Select Batch B-A2-01150']);
  expect(document.body.textContent).not.toContain('selected Batches hidden by filters');
});

it('shows the literal drawer header and Genealogy links including the current Batch self-link', async () => {
  await start(); await click(action('B-A1-01150'));
  const headerTable = one(ids.drawer).querySelector('table')!;
  expect(tableRow(headerTable, 'Lot').textContent).toContain('LOT-A1-01150');
  expect(tableRow(headerTable, 'Status').textContent).toContain('Completed');
  const genealogy = one(ids.drawerGenealogy);
  for (const value of ['ML-PVC-043', 'LOT-E2-00659', 'LOT-RF1-00488', 'LOT-A1-01150', 'SN-A1-001150']) {
    expect([...genealogy.querySelectorAll('span')].some(el => el.textContent === value)).toBe(true);
  }
  const links = [...genealogy.querySelectorAll('a')];
  expect(links.map(link => [link.textContent, link.getAttribute('href')])).toEqual([
    ['B-E2-00659', '#/ledger'], ['B-RF1-00488', '#/ledger'], ['B-A1-01150', '#/ledger'],
  ]);
  await click(links.find(link => link.textContent === 'B-A1-01150')!);
  expect(tableRow(one(ids.drawer).querySelector('table')!, 'Lot').textContent).toContain('LOT-A1-01150');
  expect(document.activeElement?.textContent).toBe('Batch details · B-A1-01150');
  expect(one(ids.drawer).contains(document.activeElement)).toBe(true);
  expect(document.activeElement?.getAttribute('tabindex')).toBe('-1');
});

it('sorts Portuguese Area and Status by displayed labels through the Screen', async () => {
  // Five unchanged seeded records span all Areas and statuses and fit the virtual viewport.
  const data = { ...dataset, batches: dataset.batches.filter(batch => [
    'B-E1-00001', 'B-C1-00001', 'B-A1-00001', 'B-A1-00008', 'B-A1-00026',
  ].includes(batch.id)) };
  data.lots = dataset.lots.filter(lot => [...data.batches, ...data.activeBatches].some(batch => batch.id === lot.batchId));
  await start('pt-BR', data);
  await click(header('Área'));
  expect(header('Área').getAttribute('aria-sort')).toBe('ascending');
  expectGrid(5, ['B-E1-00001', 'B-C1-00001', 'B-A1-00001', 'B-A1-00008', 'B-A1-00026'], 'pt-BR');
  expect(rows().map(row => row.querySelectorAll('[role="cell"]')[4]!.textContent)).toEqual(['Extrusão', 'Metalurgia', 'Montagem', 'Montagem', 'Montagem']);
  await click(header('Status'));
  expect(header('Status').getAttribute('aria-sort')).toBe('ascending');
  expectGrid(5, ['B-A1-00001', 'B-E1-00001', 'B-A1-00008', 'B-A1-00026', 'B-C1-00001'], 'pt-BR');
  expect(rows().map(row => row.querySelectorAll('[role="cell"]')[12]!.textContent)).toEqual(['Concluído', 'Concluído', 'Interrompido', 'Retrabalho', 'Retrabalho']);
});

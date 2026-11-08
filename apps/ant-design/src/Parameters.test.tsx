// @vitest-environment happy-dom
import {
  TEST_IDS, generateMockDataset, ptBR, simulate, t, tagGridView, tr,
  type Locale, type MessageKey, type TagFilters,
} from '@swatchbook/core';
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { parametersCoverage } from '../../../packages/core/src/i18n/strings/parameters-coverage';
import { byId, click, endMotion, mountApp, one, openSelect, plantState, choose } from './test-utils';

beforeAll(async () => { await import('@swatchbook/charts'); });
const ids = TEST_IDS.parameters;
const dataset = generateMockDataset();
let view: Awaited<ReturnType<typeof mountApp>> | undefined;
beforeEach(() => {
  localStorage.clear(); document.body.innerHTML = '';
  const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')?.get;
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')?.get;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.getAttribute('role') === 'img' ? 880 : width?.call(this) ?? 0;
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.getAttribute('role') === 'img' ? 320 : height?.call(this) ?? 0;
  });
});
afterEach(async () => {
  await view?.unmount(); view = undefined; history.replaceState(null, '', '/');
  vi.useRealTimers(); vi.restoreAllMocks();
});
const text = (id: string) => one(id).textContent ?? '';
const referencedText = (element: Element, attribute: string) => (element.getAttribute(attribute) ?? '')
  .split(/\s+/).filter(Boolean).map(id => {
    const description = document.getElementById(id);
    expect(description, `missing ${attribute} target ${id}`).not.toBeNull();
    return description!.textContent;
  }).join(' ');
// Resolve names on the nameable controls used by this Screen, and descriptions by IDREF.
const accessibleName = (element: Element) => referencedText(element, 'aria-labelledby') || element.getAttribute('aria-label') || element.textContent || '';
const accessibleDescription = (element: Element) => referencedText(element, 'aria-describedby');

const rows = () => [...one(ids.grid).querySelectorAll<HTMLElement>('[data-row-key]')];
const row = (tagId: string) => rows().find(element => element.dataset.rowKey === tagId)!;
const button = (tagId: string, id: string) => row(tagId).querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;
const selected = () => [...byId(ids.tagSelect)].filter(element => (element as HTMLInputElement).checked);
const selectTag = (tagId: string) => click(row(tagId).querySelector(`[data-testid="${ids.tagSelect}"]`)!);
const start = async (locale: Locale = 'en') => {
  view = await mountApp('#/parameters', { dataset, languages: [locale] });
  await act(async () => { await import('@swatchbook/charts'); });
};
async function select(id: string, label: string) {
  await openSelect(id);
  const dropdown = [...document.querySelectorAll<HTMLElement>('.ant-select-dropdown')].find(el => !el.classList.contains('ant-select-dropdown-hidden'))!;
  const option = [...dropdown.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(el => el.textContent === label);
  if (!option) throw new Error(`no option ${label}`);
  await click(option);
  await endMotion();
}
const lineLabel = (id: string, locale: Locale = 'en') => `${id} · ${tr(locale, dataset.lines.find(line => line.id === id)!.name)}`;
const machineLabel = (id: string, locale: Locale = 'en') => `${id} · ${tr(locale, dataset.machines.find(machine => machine.id === id)!.name)}`;
async function clear(id: string) { await click(one(id).querySelector('.ant-select-clear')!); await endMotion(); }
async function input(id: string, value: string) {
  const host = one(id);
  const target = host instanceof HTMLInputElement ? host : host.querySelector('input')!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, value);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    target.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  });
}
function expectGrid(filters: TagFilters) {
  const expected = tagGridView(dataset, simulate(dataset, 0, plantState().overlay), filters).rows;
  // Native virtualization mounts the visible prefix, rather than all 300 Tags.
  expect(rows().map(row => row.dataset.rowKey)).toEqual(expected.slice(0, rows().length).map(row => row.tagId));
  expect(one(ids.grid).getAttribute('aria-rowcount')).toBe(String(expected.length + 1));
  expect(rows().length > 0).toBe(expected.length > 0);
}
async function focusTag(id: string, locale: Locale = 'en') {
  const tag = dataset.tags.find(tag => tag.id === id)!;
  await select(ids.filterMachine, machineLabel(tag.machineId, locale));
  await input(ids.search, tag.name);
}
const target = 'E1-puller.puller-speed';
async function openOverride(locale: Locale = 'en') {
  await focusTag(target, locale);
  await click(button(target, ids.override));
}
async function cancel(locale: Locale = 'en') {
  await click([...document.querySelectorAll<HTMLButtonElement>('.ant-modal button')].find(button => button.textContent === t(locale, 'action.cancel'))!);
  await endMotion();
}

it('renders the required blocks, native virtual Table, ordered core rows and all Machine links under StrictMode', async () => {
  await start();
  expect(byId('parameters.placeholder')).toHaveLength(0);
  for (const id of [ids.grid, ids.filterLine, ids.filterMachine, ids.filterStatus, ids.search, ids.trend, ids.trendWindow, ids.trendEmpty, ids.connectivity]) expect(byId(id), id).toHaveLength(1);
  const grid = one(ids.grid);
  expect(grid.querySelector('table')?.getAttribute('role')).toBe('presentation');
  expect(grid.getAttribute('aria-colcount')).toBe('11');
  expect(grid.querySelectorAll('[role="rowgroup"]')).toHaveLength(2);
  const header = grid.querySelector('thead')!;
  expect(header.getAttribute('role')).toBe('rowgroup');
  expect(header.querySelector('tr')?.getAttribute('role')).toBe('row');
  expect(header.querySelector('tr')?.getAttribute('aria-rowindex')).toBe('1');
  expect(header.querySelectorAll('[role="columnheader"]')).toHaveLength(11);
  expect(one(ids.grid).querySelector('.ant-table-tbody-virtual')).not.toBeNull();
  expect(rows().length).toBeLessThan(dataset.tags.length);
  expectGrid({});
  expect(one(ids.grid).getAttribute('role')).toBe('table');
  expect(one(ids.grid).getAttribute('aria-label')).toBe('Live Tags');
  expect(one(ids.grid).querySelector('thead input')?.getAttribute('aria-label')).toBe('Select all visible Tags for the trend');
  expect(one(ids.grid).querySelector('[aria-sort]')).toBeNull();
  expect(one(ids.grid).querySelector('[aria-live]:not([aria-live="off"]), [role="alert"], [role="status"]')).toBeNull();
  expect(one(ids.trend).querySelector('[aria-live]:not([aria-live="off"]), [role="alert"], [role="status"]')).toBeNull();
  expect(text(ids.trendEmpty)).toBe('Select Tags to show a trend.');
  expect(document.body.textContent).not.toContain('Limit: Minimum / Maximum');
  expect(one(ids.connectivity).querySelectorAll('tbody tr[data-row-key]')).toHaveLength(27);
  for (const item of dataset.machines) expect(text(ids.connectivity)).toContain(item.id);
  for (const [index, element] of rows().entries()) {
    expect(element.closest('[role="rowgroup"]')).not.toBeNull();
    expect(element.getAttribute('aria-rowindex')).toBe(String(index + 2));
    expect(element.getAttribute('role')).toBe('row');
    expect(element.querySelectorAll('[role="cell"]')).toHaveLength(11);
    expect(element.querySelector('input')?.getAttribute('aria-label')).toBe(`Select Tag ${element.dataset.rowKey} for the trend`);
  }
});

it.each(['en', 'pt-BR'] as const)('keeps all eleven columns, unbroken headers and full stacked action labels in %s', async locale => {
  await start(locale);
  const grid = one(ids.grid);
  const headers = [...grid.querySelectorAll<HTMLElement>('thead th')];
  expect(headers).toHaveLength(11);
  for (const header of headers.slice(1)) expect(header.style.whiteSpace).toBe('nowrap');
  // Widths preserve names and labels without overriding density or theme tokens.
  const widths = [...grid.querySelectorAll<HTMLElement>('colgroup col')].map(col => parseFloat(col.style.width));
  expect(widths).toHaveLength(11);
  expect(widths.reduce((sum, width) => sum + width, 0)).toBeLessThanOrEqual(1047);
  const first = rows()[0]!;
  for (const [id, label] of [[ids.override, 'parameters.override'], [ids.resetRecipe, 'action.reset-to-recipe']] as const) {
    const action = button(first.dataset.rowKey!, id);
    expect(action.textContent).toBe(t(locale, label));
    expect(action.classList.contains('ant-btn-sm')).toBe(true);
    expect(action.style.whiteSpace).toBe('nowrap');
    expect(action.style.height).toBe('');
  }
  const actions = first.querySelector<HTMLElement>('.ant-space')!;
  expect(actions.style.rowGap).toBe('2px');
});

it.each([
  ['en', 'comfortable'], ['en', 'compact'], ['pt-BR', 'comfortable'], ['pt-BR', 'compact'],
] as const)('pins selection left and Actions right with coherent virtual table roles in %s, %s', async (locale, density) => {
  await start(locale);
  if (density === 'compact') await choose(TEST_IDS.shell.density, t(locale, 'density.compact'));
  const grid = one(ids.grid);
  const widths = [...grid.querySelectorAll<HTMLElement>('colgroup col')].map(col => parseFloat(col.style.width));
  expect(widths).toEqual([40, 48, 88, 112, 104, 72, 76, 80, 80, 72, 256]);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  // Ant uses scroll.x for the header table and each virtual row's minimum width.
  expect(totalWidth).toBe(1028);
  expect(grid.querySelector<HTMLTableElement>('table')!.style.width).toBe(`${totalWidth}px`);
  expect(grid.getAttribute('role')).toBe('table');
  expect(grid.getAttribute('aria-colcount')).toBe('11');
  expect(grid.getAttribute('aria-rowcount')).toBe(String(dataset.tags.length + 1));
  expect(grid.querySelectorAll('table')).toHaveLength(1);
  expect(grid.querySelector('table')!.getAttribute('role')).toBe('presentation');
  expect(grid.querySelectorAll('[role="rowgroup"]')).toHaveLength(2);
  const header = grid.querySelector<HTMLElement>('thead [role="row"]')!;
  expect(header.getAttribute('aria-rowindex')).toBe('1');
  expect(header.querySelectorAll('[role="columnheader"]')).toHaveLength(11);
  const bodyRows = rows();
  expect(grid.querySelectorAll('[role="row"]')).toHaveLength(bodyRows.length + 1);
  for (const [index, row] of bodyRows.entries()) {
    expect(row.style.width).toBe(`${totalWidth}px`);
    expect(row.getAttribute('role')).toBe('row');
    expect(row.getAttribute('aria-rowindex')).toBe(String(index + 2));
    expect(row.closest('[role="rowgroup"]')).not.toBeNull();
    expect(row.querySelectorAll('[role="cell"]')).toHaveLength(11);
  }
  // Fixed columns stay in their original rows, rather than separate cloned tables.
  for (const row of [header, ...bodyRows]) {
    const cells = row.querySelectorAll<HTMLElement>('[role="columnheader"], [role="cell"]');
    expect(cells[0]!.classList.contains('ant-table-cell-fix-start')).toBe(true);
    expect(parseFloat(cells[0]!.style.insetInlineStart)).toBe(0);
    expect(cells[10]!.classList.contains('ant-table-cell-fix-end')).toBe(true);
    expect(parseFloat(cells[10]!.style.insetInlineEnd)).toBe(0);
    expect([...cells].filter(cell => cell.classList.contains('ant-table-cell-fix'))).toHaveLength(2);
  }
});

it('filters by Line, Machine, status and case insensitive name, combines filters, and shows an empty state', async () => {
  await start();
  await select(ids.filterLine, lineLabel('E1')); expectGrid({ lineId: 'E1' });
  await select(ids.filterMachine, machineLabel('E1-extruder')); expectGrid({ lineId: 'E1', machineId: 'E1-extruder' });
  await select(ids.filterStatus, 'Normal'); expectGrid({ lineId: 'E1', machineId: 'E1-extruder', status: 'normal' });
  await input(ids.search, 'BARREL'); expectGrid({ lineId: 'E1', machineId: 'E1-extruder', status: 'normal', search: 'BARREL' });
  await input(ids.search, 'does-not-exist');
  expect(rows()).toHaveLength(0); expect(text(ids.gridEmpty)).toContain('No Tags match the filters.');
  expect(byId(ids.empty)).toHaveLength(0);
  await input(ids.search, ''); await clear(ids.filterStatus); await clear(ids.filterMachine); await clear(ids.filterLine);
  expectGrid({});
  await select(ids.filterMachine, machineLabel('E2-extruder')); expectGrid({ machineId: 'E2-extruder' });
  await clear(ids.filterMachine);
  for (const [label, status] of [['Stale', 'stale'], ['High', 'high'], ['Low', 'low']] as const) {
    await select(ids.filterStatus, label); expectGrid({ status }); await clear(ids.filterStatus);
  }
  await input(ids.search, 'water'); expectGrid({ search: 'water' });
});

it('keeps four selected Tags, refuses the fifth and bulk select-all, and clears notices on context changes', async () => {
  await start();
  const first = rows().slice(0, 5).map(row => row.dataset.rowKey!);
  for (const id of first.slice(0, 4)) await selectTag(id);
  expect(selected()).toHaveLength(4);
  expect(one(ids.trend).querySelectorAll('tbody tr')).toHaveLength(600);
  expect(one(ids.trend).querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Selected Tag values and setpoints over time');
  expect(one(ids.trend).querySelector('svg')).not.toBeNull();
  expect(document.body.textContent).toContain('Limit: Minimum / Maximum');
  await selectTag(first[4]!);
  expect(selected()).toHaveLength(4);
  expect(text(ids.trendLimit)).toBe('Select at most four Tags.');
  expect(one(ids.trendLimit).getAttribute('role')).toBe('status');
  expect(one(ids.trendLimit).classList.contains('ant-alert-warning')).toBe(true);
  expect(one(ids.trend).querySelectorAll('tbody tr')).toHaveLength(600);
  await select(ids.trendWindow, 'Last 30 minutes');
  expect(byId(ids.trendLimit)).toHaveLength(0);
  expect(one(ids.trend).querySelectorAll('tbody tr')).toHaveLength(720);
  await select(ids.trendWindow, 'Last 2 hours');
  expect(one(ids.trend).querySelectorAll('tbody tr')).toHaveLength(720);
  await click(one(ids.grid).querySelector('thead input')!);
  expect(selected()).toHaveLength(4); expect(byId(ids.trendLimit)).toHaveLength(1);
  await selectTag(first[0]!); expect(selected()).toHaveLength(3); expect(byId(ids.trendLimit)).toHaveLength(0);
});

it('preserves hidden selections through filtering and applies native select-all when at most four Tags match', async () => {
  await start();
  const first = rows()[0]!.dataset.rowKey!;
  await selectTag(first);
  await focusTag(target);
  await click(one(ids.grid).querySelector('thead input')!);
  expect(text(ids.trend)).toContain('E1-puller · puller-speed');
  expect(one(ids.trend).querySelectorAll('tbody tr')).toHaveLength(300);
  await click(one(ids.grid).querySelector('thead input')!);
  expect(one(ids.trend).querySelectorAll('tbody tr')).toHaveLength(150);
  await input(ids.search, ''); await clear(ids.filterMachine);
  expect(row(first).querySelector<HTMLInputElement>('input')!.checked).toBe(true);
});

it('requires a reason and lets core refuse out of range and missing values, with warning status notices', async () => {
  await start(); await openOverride();
  expect(one(ids.overrideReason).hasAttribute('required')).toBe(true);
  const before = plantState();
  await input(ids.overrideValue, '3'); await click(one(ids.overrideApply));
  expect(text(ids.overrideError)).toBe('Enter a reason for the setpoint override.');
  expect(plantState()).toBe(before);
  await input(ids.overrideReason, 'Process trial');
  expect(byId(ids.overrideError)).toHaveLength(0);
  await input(ids.overrideValue, '99'); await click(one(ids.overrideApply));
  expect(text(ids.overrideError)).toBe('The value must be within the minimum and maximum.');
  expect(one(ids.overrideError).getAttribute('role')).toBe('status');
  expect(one(ids.overrideError).classList.contains('ant-alert-warning')).toBe(true);
  expect(plantState()).toBe(before);
  await input(ids.overrideValue, ''); await click(one(ids.overrideApply));
  expect(text(ids.overrideError)).toBe('Enter a finite numeric value.');
  expect(plantState()).toBe(before);
  await cancel(); await click(button(target, ids.override));
  expect(byId(ids.overrideError)).toHaveLength(0);
});

it('overrides from the action tick, preserves earlier trend points, logs once, and resets to the recipe value', async () => {
  view = await mountApp('#/parameters', { dataset, search: '?tick=100' });
  await act(async () => { await import('@swatchbook/charts'); });
  await openOverride();
  await cancel();
  await selectTag(target);
  const table = () => one(`${ids.trend}-data`);
  const beforePoints = [...table().querySelectorAll('tbody tr')].map(row => row.textContent);
  const before = plantState().events.length;
  await click(button(target, ids.override));
  await input(ids.overrideValue, '3'); await input(ids.overrideReason, 'Process trial');
  await click(one(ids.overrideApply)); await endMotion();
  expect(plantState().events).toHaveLength(before + 1);
  expect(plantState().events.at(-1)).toMatchObject({ action: 'setpoint-override', target, newValue: 3, note: 'Process trial' });
  expect(row(target).querySelectorAll('[role="cell"]')[6]!.textContent).toBe('3.0');
  const afterPoints = [...table().querySelectorAll('tbody tr')].map(row => row.textContent);
  expect(afterPoints.slice(0, -1)).toEqual(beforePoints.slice(0, -1));
  expect(afterPoints.at(-1)).not.toBe(beforePoints.at(-1));
  expect(table().querySelector('tbody tr:last-child td:last-child')?.textContent).toBe('3.0 m/min');
  const recipe = 2.1;
  expect(button(target, ids.resetRecipe).getAttribute('aria-disabled')).toBe('false');
  expect(accessibleDescription(button(target, ids.resetRecipe))).toBe('Recipe value: 2.1 m/min');
  await click(button(target, ids.resetRecipe));
  expect(plantState().events).toHaveLength(before + 2);
  expect(plantState().events.at(-1)).toMatchObject({ action: 'reset-to-recipe', target, oldValue: 3, newValue: recipe });
  expect(button(target, ids.resetRecipe).getAttribute('aria-disabled')).toBe('true');
  expect(accessibleDescription(button(target, ids.resetRecipe))).toBe('Recipe value: 2.1 m/min The setpoint already matches the recipe value.');
  expect(row(target).querySelectorAll('[role="cell"]')[6]!.textContent).toBe('2.1');
  // The same Event Log that Screen 6 renders includes both changes.
  await click(one(TEST_IDS.shell.navControl));
  expect(one(TEST_IDS.control.eventLog).textContent).toContain('Process trial');
  expect(one(TEST_IDS.control.eventLog).textContent).toContain('Setpoint manually overridden');
  expect(one(TEST_IDS.control.eventLog).textContent).toContain('Setpoint restored to recipe value');
});

it.each(['en', 'pt-BR'] as const)('describes unavailable actions with the core reason and keeps one focusable button per action in %s', async locale => {
  await start(locale);
  await select(ids.filterStatus, t(locale, 'tag-status.stale'));
  expect(rows().length).toBeGreaterThan(0);
  const before = plantState();
  for (const element of rows()) {
    for (const id of [ids.override, ids.resetRecipe]) {
      const action = button(element.dataset.rowKey!, id);
      expect(action.disabled).toBe(false);
      expect(action.getAttribute('aria-disabled')).toBe('true');
      expect(action.tabIndex).toBe(0);
      expect(accessibleName(action)).toBe(t(locale, id === ids.override ? 'parameters.override' : 'action.reset-to-recipe'));
      expect(accessibleDescription(action)).toContain(t(locale, 'plant-error.tag-stale'));
      expect(element.querySelector('span[tabindex]')).toBeNull();
      await click(action);
    }
  }
  expect(plantState()).toBe(before);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  const offline = dataset.machines.find(machine => machine.comms.status === 'offline')!;
  expect(one(ids.connectivity).querySelector(`[data-row-key="${offline.id}"]`)?.textContent).toContain(t(locale, 'link-status.offline'));
  await clear(ids.filterStatus); await input(ids.search, 'motor-current');
  for (const element of rows()) {
    expect(accessibleDescription(button(element.dataset.rowKey!, ids.override))).toBe(t(locale, 'plant-error.tag-not-writable'));
  }
});

it.each([['en', '2.1', '2.5'], ['pt-BR', '2,1', '2,5']] as const)('edits decimal setpoints in %s without changing their magnitude', async (locale, initial, typed) => {
  await start(locale); await openOverride(locale);
  const field = one(ids.overrideValue) as HTMLInputElement;
  expect(field.value).toBe(initial);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(`${t(locale, 'parameters.recipe-value')}: ${initial} m/min`);
  for (let length = 1; length <= typed.length; length++) await input(ids.overrideValue, typed.slice(0, length));
  expect(field.value).toBe(typed);
  await input(ids.overrideReason, 'Decimal trial');
  await click(one(ids.overrideApply)); await endMotion();
  expect(plantState().events.at(-1)).toMatchObject({ action: 'setpoint-override', target, newValue: 2.5, note: 'Decimal trial' });
});

it('explains a Stale refusal once when the heartbeat passes while the Override dialog is open', async () => {
  vi.useFakeTimers(); let clock = 0;
  const tag = dataset.tags.find(tag => tag.name === 'barrel-zone-1-temp' && tag.writable)!;
  const liveDataset = { ...dataset, machines: dataset.machines.map(machine => machine.id === tag.machineId
    ? { ...machine, comms: { ...machine.comms, status: 'offline' as const, lastHeartbeatAt: dataset.now + 2000 } } : machine) };
  view = await mountApp('#/parameters', { dataset: liveDataset, search: '', now: () => clock });
  await input(ids.search, tag.name);
  await click(button(tag.id, ids.override));
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(one(ids.overrideApply).hasAttribute('disabled')).toBe(false);
  expect(dialog.querySelector('[role="status"]')).toBeNull();
  clock = 3000;
  await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
  expect(row(tag.id).textContent).toContain('Stale');
  expect(one(ids.overrideApply).hasAttribute('disabled')).toBe(true);
  const status = dialog.querySelector('[role="status"]')!;
  expect(status.textContent).toBe(t('en', 'plant-error.tag-stale'));
  expect(status.closest('[hidden], [aria-hidden="true"]')).toBeNull();
  clock = 4000;
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(dialog.querySelectorAll('[role="status"]')).toHaveLength(1);
  expect(dialog.querySelector('[role="status"]')).toBe(status);
});

it('uses the native table size when switching density and ellipsizes full Tag names with titles', async () => {
  await start();
  expect(one(ids.grid).querySelector('.ant-table-medium')).not.toBeNull();
  await choose(TEST_IDS.shell.density, 'Compact');
  expect(one(ids.grid).querySelector('.ant-table-small')).not.toBeNull();
  expect(one(ids.grid).querySelector('.ant-table-medium')).toBeNull();
  const cells = rows()[0]!.querySelectorAll<HTMLElement>('[role="cell"]');
  for (const [index, title] of [[2, dataset.tags[0]!.machineId], [3, dataset.tags[0]!.name]] as const) {
    expect(cells[index]!.classList.contains('ant-table-cell-ellipsis')).toBe(true);
    expect(cells[index]!.title).toBe(title);
  }
});

it('updates live values and retains selection after a clock tick under StrictMode', async () => {
  vi.useFakeTimers(); let clock = 0;
  view = await mountApp('#/parameters', { dataset, search: '', now: () => clock });
  await act(async () => { await import('@swatchbook/charts'); });
  // Filter directly by search here so no CSS-motion timer is needed.
  await input(ids.search, 'barrel-zone-1-temp');
  const id = rows()[0]!.dataset.rowKey!;
  const value = () => row(id).querySelectorAll('[role="cell"]')[4]!.textContent;
  await selectTag(id);
  const before = value();
  clock = 1000;
  await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
  expect(value()).not.toBe(before);
  expect(selected()).toHaveLength(1);
  expect(row(id).querySelector<HTMLInputElement>('input')!.checked).toBe(true);
});

it('renders Portuguese controls, select-all, statuses and chart text without fallback keys', async () => {
  await start('pt-BR');
  expect(one(ids.grid).querySelector('thead input')?.getAttribute('aria-label')).toBe('Selecionar todas as Tags visíveis para a tendência');
  expect(text(ids.grid)).toContain('Valor atual');
  expect(text(ids.connectivity)).toContain('Última comunicação');
  await focusTag(target, 'pt-BR'); await selectTag(target);
  expect(one(ids.trend).querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Valores e setpoints das Tags selecionadas ao longo do tempo');
  expect(one(`${ids.trend}-data`).textContent).toContain('Mínimo');
  await click(button(target, ids.override));
  await input(ids.overrideValue, '99'); await input(ids.overrideReason, 'Teste'); await click(one(ids.overrideApply));
  expect(text(ids.overrideError)).toBe(ptBR['plant-error.value-out-of-range']);
  expect(document.body.textContent).not.toContain('[[');
});

it.each(['en', 'pt-BR'] as const)('renders reachable parameters manifest text and accessible control names and descriptions in %s', async locale => {
  const keys = new Set<MessageKey>([...Object.values(parametersCoverage.shows), ...Object.values(parametersCoverage.actions), ...Object.values(parametersCoverage.states)].flat());
  // Unknown/duplicate selections and a missing connectivity list are defensive core states,
  // with no ordinary UI path for this immutable Mock Dataset.
  for (const key of ['trend-error.duplicate-tag', 'trend-error.unknown-tag', 'parameters.connectivity-empty'] as const) keys.delete(key);
  const seen = new Set<MessageKey>();
  const capture = () => {
    const rendered = [document.body.textContent ?? '', ...[...document.querySelectorAll('button, input, [role="combobox"], [role="img"]')].flatMap(el => [accessibleName(el), accessibleDescription(el)]), ...[...document.querySelectorAll('input[placeholder]')].map(el => el.getAttribute('placeholder') ?? '')].join('\n');
    for (const message of keys) {
      const values = message === 'parameters.select-tag'
        ? dataset.tags.map(tag => t(locale, message, { tag: tag.id })) : [t(locale, message)];
      if (values.some(value => rendered.includes(value))) seen.add(message);
    }
  };
  await start(locale); capture();
  await selectTag(rows()[0]!.dataset.rowKey!); capture();
  await selectTag(rows()[0]!.dataset.rowKey!);
  await openSelect(ids.trendWindow); capture();
  await select(ids.trendWindow, t(locale, 'trend-window.last-5m'));
  await click(one(ids.grid).querySelector('thead input')!); capture();
  await select(ids.filterStatus, t(locale, 'tag-status.stale')); capture();
  await clear(ids.filterStatus); await input(ids.search, 'not-a-tag'); capture();
  await input(ids.search, ''); await openOverride(locale); capture();
  for (const [value, reason] of [['3', ''], ['99', 'Trial'], ['', 'Trial']] as const) {
    await input(ids.overrideValue, value); await input(ids.overrideReason, reason); await click(one(ids.overrideApply)); capture();
  }
  await cancel(locale);
  await view!.unmount();
  view = await mountApp('#/parameters', { dataset: { ...dataset, machines: [], tags: [], alarms: [], events: [] }, languages: [locale] }); capture();
  expect(byId(ids.empty)).toHaveLength(1); expect(byId(ids.gridEmpty)).toHaveLength(0); expect(byId(ids.trendEmpty)).toHaveLength(0);
  expect([...keys].filter(message => !seen.has(message))).toEqual([]);
});

// @vitest-environment happy-dom
import * as core from '@swatchbook/core';
import {
  TEST_IDS, generateMockDataset, ptBR, simulate, t, tagGridView, tr,
  type Locale, type MessageKey, type TagFilters,
} from '@swatchbook/core';
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { parametersCoverage } from '../../../packages/core/src/i18n/strings/parameters-coverage';
import { byId, click, endMotion, mountApp, one, openSelect, plantState } from './test-utils';

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
  expect(one(ids.grid).querySelector('table')).not.toBeNull();
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
  expect(one(ids.connectivity).querySelectorAll('tbody tr[data-row-key]')).toHaveLength(27);
  for (const item of dataset.machines) expect(text(ids.connectivity)).toContain(item.id);
  for (const element of rows()) {
    expect(element.getAttribute('role')).toBe('row');
    expect(element.querySelectorAll('[role="cell"]')).toHaveLength(11);
    expect(element.querySelector('input')?.getAttribute('aria-label')).toBe(`Select Tag ${element.dataset.rowKey} for the trend`);
  }
});

it.each(['en', 'pt-BR'] as const)('keeps all eleven columns, unbroken headers and compact full action labels in %s', async locale => {
  await start(locale);
  const grid = one(ids.grid);
  const headers = [...grid.querySelectorAll<HTMLElement>('thead th')];
  expect(headers).toHaveLength(11);
  for (const header of headers.slice(1)) expect(header.style.whiteSpace).toBe('nowrap');
  // Leave room for the native vertical scrollbar at the narrowest desktop width.
  const widths = [...grid.querySelectorAll<HTMLElement>('colgroup col')].map(col => parseFloat(col.style.width));
  expect(widths).toHaveLength(11);
  expect(widths.reduce((sum, width) => sum + width, 0)).toBeLessThanOrEqual(840);
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
  await selectTag(target);
  const table = () => one(`${ids.trend}-data`);
  const beforePoints = [...table().querySelectorAll('tbody tr')].map(row => row.textContent);
  const before = plantState().events.length;
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
  expect(button(target, ids.resetRecipe).disabled).toBe(false);
  await click(button(target, ids.resetRecipe));
  expect(plantState().events).toHaveLength(before + 2);
  expect(plantState().events.at(-1)).toMatchObject({ action: 'reset-to-recipe', target, oldValue: 3, newValue: recipe });
  expect(button(target, ids.resetRecipe).disabled).toBe(true);
  expect(row(target).querySelectorAll('[role="cell"]')[6]!.textContent).toBe('2.1');
  // The same Event Log that Screen 6 renders includes both changes.
  await click(one(TEST_IDS.shell.navControl));
  expect(one(TEST_IDS.control.eventLog).textContent).toContain('Process trial');
  expect(one(TEST_IDS.control.eventLog).textContent).toContain('Setpoint manually overridden');
  expect(one(TEST_IDS.control.eventLog).textContent).toContain('Setpoint restored to recipe value');
});

it('disables Stale and non-writable Overrides with accessible core reasons and shows every Offline link', async () => {
  await start();
  await select(ids.filterStatus, 'Stale');
  expect(rows().length).toBeGreaterThan(0);
  for (const element of rows()) {
    expect(element.textContent).toContain('Stale');
    expect(button(element.dataset.rowKey!, ids.override).disabled).toBe(true);
    expect(element.querySelector('[aria-label="This Tag is stale. Check the machine connection."]')).not.toBeNull();
  }
  const offline = dataset.machines.find(machine => machine.comms.status === 'offline')!;
  expect(one(ids.connectivity).querySelector(`[data-row-key="${offline.id}"]`)?.textContent).toContain('Offline');
  await clear(ids.filterStatus); await input(ids.search, 'motor-current');
  for (const element of rows()) {
    expect(button(element.dataset.rowKey!, ids.override).disabled).toBe(true);
    expect(element.querySelector('[aria-label="This Tag does not allow setpoint changes."]')).not.toBeNull();
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

it.each(['en', 'pt-BR'] as const)('renders every parameters manifest key across its states in %s', async locale => {
  const keys = new Set<MessageKey>([...Object.values(parametersCoverage.shows), ...Object.values(parametersCoverage.actions), ...Object.values(parametersCoverage.states)].flat());
  const seen = new Set<MessageKey>();
  const capture = () => {
    const rendered = [document.body.textContent ?? '', ...[...document.querySelectorAll('[aria-label], [placeholder]')].flatMap(el => [el.getAttribute('aria-label') ?? '', el.getAttribute('placeholder') ?? ''])].join('\n');
    for (const message of keys) {
      const values = message === 'parameters.select-tag'
        ? dataset.tags.map(tag => t(locale, message, { tag: tag.id })) : [t(locale, message)];
      if (values.some(value => rendered.includes(value))) seen.add(message);
    }
  };
  await start(locale); capture();
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
  // Protective core errors have no ordinary UI path; render the exact core result.
  for (const error of ['duplicate-tag', 'unknown-tag'] as const) {
    const mock = vi.spyOn(core, 'trendView').mockReturnValue({ error });
    await select(ids.trendWindow, t(locale, 'trend-window.last-30m')); capture();
    mock.mockRestore();
    await select(ids.trendWindow, t(locale, 'trend-window.last-5m'));
  }
  await view!.unmount();
  view = await mountApp('#/parameters', { dataset: { ...dataset, machines: [], tags: [], alarms: [], events: [] }, languages: [locale] }); capture();
  expect(byId(ids.empty)).toHaveLength(1); expect(byId(ids.gridEmpty)).toHaveLength(0); expect(byId(ids.trendEmpty)).toHaveLength(0);
  await view.unmount();
  const emptyLinks = vi.spyOn(core, 'connectivityView').mockReturnValue([]);
  view = await mountApp('#/parameters', { dataset, languages: [locale] });
  capture();
  emptyLinks.mockRestore();
  expect([...keys].filter(message => !seen.has(message))).toEqual([]);
});

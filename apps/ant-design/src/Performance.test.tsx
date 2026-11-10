// @vitest-environment happy-dom
import {
  TEST_IDS, generateMockDataset, t, type HourlyRecord, type Locale, type MessageKey, type MockDataset,
} from '@swatchbook/core';
import * as core from '@swatchbook/core';
import * as registration from '../../../packages/charts/src/register';
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { performanceCoverage } from '../../../packages/core/src/i18n/strings/performance-coverage';
import { byId, choose, click, endMotion, mountApp, one, openSelect } from './test-utils';

beforeAll(async () => { await import('@swatchbook/charts'); });
const ids = TEST_IDS.performance;
const dataset = generateMockDataset();
const HOUR = 3_600_000;
function hour(offset: number, overrides: Partial<HourlyRecord> = {}): HourlyRecord {
  return { hourStart: dataset.now + offset * HOUR, lineId: 'E1', plannedMin: 60, runMin: 30,
    targetUnits: 100, goodUnits: 40, scrapUnits: 10,
    downtime: [{ reason: 'changeover', minutes: 20 }, { reason: 'minor-stops', minutes: 10 }], ...overrides };
}
const known: MockDataset = { ...dataset, hourlyOutput: Array.from({ length: 240 }, (_, i) => hour(i - 240,
  i >= 224 && i < 232 ? { runMin: 60, goodUnits: 60, scrapUnits: 20, downtime: [] } : {})) };
let view: Awaited<ReturnType<typeof mountApp>> | undefined;
beforeEach(() => {
  localStorage.clear(); document.body.innerHTML = '';
  const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')?.get;
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')?.get;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.getAttribute('role') === 'img' ? 880 : width?.call(this) ?? 0;
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.getAttribute('role') === 'img' ? 360 : height?.call(this) ?? 0;
  });
});
afterEach(async () => {
  await view?.unmount(); view = undefined; history.replaceState(null, '', '/'); vi.useRealTimers(); vi.restoreAllMocks();
});
async function start(data = known, locale: Locale = 'en') {
  view = await mountApp('#/performance', { dataset: data, languages: [locale] });
  await act(async () => { await Promise.resolve(); });
}
const text = (id: string) => one(id).textContent ?? '';
const value = (id: string) => one(id).querySelector('.ant-statistic-content')?.textContent;
const rows = (id: string) => [...one(id).querySelectorAll<HTMLTableRowElement>('tbody tr')];
const shiftRows = () => rows(ids.shiftHistory).filter(row => row.hasAttribute('data-row-key'));
const key = (target: Element, value: string) => act(() => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
});
async function select(id: string, label: string) {
  await openSelect(id);
  const dropdown = [...document.querySelectorAll<HTMLElement>('.ant-select-dropdown')].find(el => !el.classList.contains('ant-select-dropdown-hidden'))!;
  const option = [...dropdown.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(el => el.textContent === label);
  if (!option) throw new Error(`no option ${label}`);
  await click(option);
  await key(one(id).querySelector('input')!, 'Escape');
  await endMotion();
}

it('renders four named KPI cards, the displayed product, signed point deltas and a real 30-row history table', async () => {
  await start();
  expect(byId('performance.placeholder')).toHaveLength(0);
  expect(byId(ids.empty)).toHaveLength(0);
  // Known eight-hour totals: 240/480 run minutes, 400/800 units, 320/400 good units.
  expect([value(ids.oee), value(ids.availability), value(ids.performance), value(ids.quality)])
    .toEqual(['20.0%', '50.0%', '50.0%', '80.0%']);
  expect([ids.oee, ids.availability, ids.performance, ids.quality].map(id => one(id).querySelector('.ant-statistic-title')?.textContent))
    .toEqual(['OEE', 'Availability', 'Performance', 'Quality']);
  // 0.5 × 0.5 × 0.8 = 0.2. Previous: 1 × 0.8 × 0.75 = 0.6.
  for (const [id, before, delta] of [
    [ids.oee, '60.0%', '-40.0 pp'], [ids.availability, '100.0%', '-50.0 pp'],
    [ids.performance, '80.0%', '-30.0 pp'], [ids.quality, '75.0%', '+5.0 pp'],
  ]) {
    expect(text(id!)).toContain(before);
    expect(text(id!)).toContain(delta);
    expect(one(id!).hasAttribute('aria-label')).toBe(false);
    expect(one(id!).closest('[role="status"], [role="alert"], [aria-live="polite"]')).toBeNull();
  }
  expect(shiftRows()).toHaveLength(30);
  expect(one(ids.shiftHistory).querySelectorAll('table')).toHaveLength(1);
  expect(one(ids.shiftHistory).querySelector('[role="status"]')).toBeNull();
  expect(one(ids.shiftHistory).querySelector('.ant-table-tbody-virtual')).toBeNull();
  const best = shiftRows().filter(row => row.textContent?.includes('Best OEE'));
  const worst = shiftRows().filter(row => row.textContent?.includes('Worst OEE'));
  expect(best).toHaveLength(1); expect(worst).toHaveLength(1);
  expect(best[0]!.textContent).toContain('12/31/2025 14:00');
  expect(worst[0]!.textContent).toContain('12/22/2025 06:00');
  expect(one(ids.scope).querySelector('input')?.getAttribute('aria-label')).toBe('Scope');
  expect(one(ids.range).querySelector('input')?.getAttribute('aria-label')).toBe('Time range');
  await key(document.body, '/');
  expect(document.activeElement).toBe(one(ids.scope).querySelector('input'));
  await choose(TEST_IDS.shell.density, 'Compact');
  expect(one(ids.shiftHistory).classList.contains('ant-table-small')).toBe(true);
  expect(shiftRows()).toHaveLength(30);
});

it('changes Site, Area, Line and range using core totals', async () => {
  await start({ ...known, hourlyOutput: [...known.hourlyOutput,
    hour(-1, { lineId: 'E2', runMin: 60, goodUnits: 100, scrapUnits: 0, downtime: [] }),
    hour(-1, { lineId: 'A1', runMin: 45, goodUnits: 60, scrapUnits: 15 }),
  ] });
  expect(value(ids.oee)).toBe('27.6%');
  await select(ids.scope, 'Area · Extrusion');
  expect(value(ids.oee)).toBe('26.0%');
  await select(ids.scope, 'Line · E1 · Extrusion Line 1');
  expect(value(ids.oee)).toBe('20.0%');
  await select(ids.range, 'Last 24 hours');
  expect(value(ids.oee)).toBe('31.6%');
  expect(rows(`${ids.output}-data`)).toHaveLength(24);
  await select(ids.range, 'Last 7 days');
  expect(rows(`${ids.output}-data`)).toHaveLength(8);
  expect(text(ids.output)).toContain('Day');
  await select(ids.range, 'Last 30 days');
  expect(rows(`${ids.output}-data`)).toHaveLength(31);
  await select(ids.scope, 'Site');
  expect(value(ids.oee)).toBe('21.3%');
});

it('preserves Pareto order, cumulative numbers and shared pointer/keyboard selection', async () => {
  await start();
  expect(rows(`${ids.pareto}-data`).map(row => [...row.cells].map(cell => cell.textContent))).toEqual([
    ['Changeover', '160', '66.7%', '66.7%'], ['Minor stops', '80', '33.3%', '100.0%'],
  ]);
  const reasons = byId(ids.paretoReason);
  expect(reasons).toHaveLength(2);
  expect([...reasons].every(reason => reason.tagName === 'BUTTON')).toBe(true);
  await click(reasons[1]!);
  expect(reasons[1]!.getAttribute('aria-pressed')).toBe('true');
  expect(reasons[0]!.getAttribute('aria-pressed')).toBe('false');
  const summaryBlock = () => document.querySelector('.ant-descriptions')!;
  const summary = () => [...summaryBlock().querySelectorAll('.ant-descriptions-item-content')].map(el => el.textContent);
  expect(summaryBlock().querySelector('.ant-descriptions-title')?.textContent).toBe('Selected downtime reason');
  expect(summaryBlock().querySelector('[role="status"], [role="alert"], [aria-live]')).toBeNull();
  expect(summaryBlock().closest('[role="status"], [role="alert"], [aria-live]')).toBeNull();
  expect(summary()).toEqual(['Minor stops', '80', '33.3%']);
  const group = reasons[0]!.closest('[role="group"]')!;
  expect(document.getElementById(group.getAttribute('aria-labelledby')!)?.textContent).toBe('Select downtime reason');
  for (const [index, activation] of [[0, 'Enter'], [1, ' ']] as const) {
    await act(() => reasons[index]!.focus());
    await key(document.activeElement!, activation);
    // happy-dom does not synthesize a native button's activation click.
    await act(() => {
      reasons[index]!.dispatchEvent(new KeyboardEvent('keyup', { key: activation, bubbles: true }));
      reasons[index]!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    });
    expect(reasons[index]!.getAttribute('aria-pressed')).toBe('true');
    expect(summary()).toEqual(index === 0 ? ['Changeover', '160', '66.7%'] : ['Minor stops', '80', '33.3%']);
  }
  await select(ids.range, 'Last 24 hours');
  expect([...byId(ids.paretoReason)].every(reason => reason.getAttribute('aria-pressed') === 'false')).toBe(true);
});

it('names both SVG charts and exposes the actual good, scrap and separate ideal target in the output table', async () => {
  await start();
  expect(one(ids.pareto).querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Downtime by reason and cumulative percentage');
  expect(one(ids.output).querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Good and scrap output versus target');
  const table = one(`${ids.output}-data`);
  expect([...table.querySelectorAll('thead th')].map(cell => cell.textContent)).toEqual(['Hour', 'Good output', 'Scrap', 'Target']);
  expect(rows(`${ids.output}-data`)).toHaveLength(8);
  expect([...rows(`${ids.output}-data`)[0]!.cells].map(cell => cell.textContent)).toEqual(['12/31/2025 22:00', '40', '10', '100']);
  expect(table.style.display).not.toBe('none');
  expect(one(ids.output).querySelector('svg')).not.toBeNull();
});

it.each(['en', 'pt-BR'] as const)('renders translated output units and concise hourly and daily SVG ticks in %s', async locale => {
  await start(known, locale);
  const svgTexts = () => [...one(ids.output).querySelectorAll('svg text')].map(el => el.textContent);
  expect(svgTexts()).toContain(locale === 'en' ? 'Units' : 'Unidades');
  expect(svgTexts()).toEqual(expect.arrayContaining(['22:00', '23:00', '00:00', '01:00', '02:00', '03:00', '04:00', '05:00']));
  expect(svgTexts()).not.toContain(locale === 'en' ? '12/31/2025 22:00' : '31/12/2025 22:00');
  expect(rows(`${ids.output}-data`)[0]!.cells[0]!.textContent).toBe(locale === 'en' ? '12/31/2025 22:00' : '31/12/2025 22:00');
  await select(ids.range, locale === 'en' ? 'Last 7 days' : 'Últimos 7 dias');
  expect(svgTexts()).toContain(locale === 'en' ? 'Units' : 'Unidades');
  expect(svgTexts()).toContain(locale === 'en' ? '12/25/2025' : '25/12/2025');
  expect(svgTexts()).not.toContain('06:00');
  expect(rows(`${ids.output}-data`)[0]!.cells[0]!.textContent).toBe(locale === 'en' ? '12/25/2025 06:00' : '25/12/2025 06:00');
});

it('shows exactly one whole-Screen empty and replaces all block content for idle C1', async () => {
  await start(dataset);
  await select(ids.scope, 'Line · C1 · CNC Line 1');
  expect(byId(ids.empty)).toHaveLength(1);
  expect(text(ids.empty)).toContain('No performance data for this scope and range.');
  for (const id of [ids.oee, ids.pareto, ids.output, ids.shiftHistory]) expect(byId(id)).toHaveLength(0);
});

it('uses the comparison and Quality empties without inventing zero Quality or shift marks', async () => {
  await start({ ...dataset, hourlyOutput: [hour(-1, { goodUnits: 0, scrapUnits: 0, downtime: [] })] });
  expect(byId(ids.empty)).toHaveLength(0);
  expect(value(ids.quality)).toBeUndefined();
  expect(text(ids.quality)).toContain('No units produced to calculate Quality.');
  expect(text(ids.oee)).toContain('No production in the previous range to compare.');
  expect(text(ids.pareto)).toContain('No downtime in this scope and range.');
  expect(one(ids.output).querySelector('.ant-empty-description')?.textContent).toBe('No output in this scope and range.');
  expect(one(ids.output).querySelector('table, [role="img"]')).toBeNull();
  expect(byId(`${ids.output}-data`)).toHaveLength(0);
  expect(shiftRows()).toHaveLength(1);
  expect(text(ids.shiftHistory)).not.toContain('Best OEE');
  expect(text(ids.shiftHistory)).not.toContain('Worst OEE');
});

it('marks no shifts when all their OEE values tie', async () => {
  await start({ ...known, hourlyOutput: Array.from({ length: 240 }, (_, i) => hour(i - 240)) });
  expect(shiftRows()).toHaveLength(30);
  expect(text(ids.shiftHistory)).not.toContain('Best OEE');
  expect(text(ids.shiftHistory)).not.toContain('Worst OEE');
});

it('moves Last 24 hours with a timer tick and keeps Last 7 days fixed', async () => {
  vi.useFakeTimers();
  let now = 0;
  view = await mountApp('#/performance', { dataset, search: '', now: () => now });
  const timerSelect = async (label: string) => {
    await openSelect(ids.range);
    const option = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(el => el.textContent === label)!;
    await click(option);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  };
  await timerSelect('Last 24 hours');
  const output = text(`${ids.output}-data`);
  now = 100_000;
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(text(`${ids.output}-data`)).not.toBe(output);
  now = 3_600_000;
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(text(`${ids.output}-data`)).not.toBe(output);
  expect(rows(`${ids.output}-data`)[0]!.textContent).toContain('12/31/2025 08:00');
  await timerSelect('Last 7 days');
  const fixed = [text(ids.oee), text(ids.pareto), text(ids.output), text(ids.shiftHistory)];
  now = 7_200_000;
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect([text(ids.oee), text(ids.pareto), text(ids.output), text(ids.shiftHistory)]).toEqual(fixed);
});

it.each(['en', 'pt-BR'] as const)('renders every performance manifest key across real core states in %s', async locale => {
  const keys = new Set<MessageKey>([...Object.values(performanceCoverage.shows), ...Object.values(performanceCoverage.actions), ...Object.values(performanceCoverage.states)].flat());
  const seen = new Set<MessageKey>();
  const capture = () => {
    const rendered = new Set([...document.body.querySelectorAll('*')].flatMap(el => [el.textContent?.trim(), el.getAttribute('aria-label')]));
    for (const key of keys) if (rendered.has(t(locale, key))) seen.add(key);
  };
  await start(known, locale);
  expect(value(ids.oee)).toBe(locale === 'en' ? '20.0%' : '20,0%');
  expect(text(ids.quality)).toContain(locale === 'en' ? '+5.0 pp' : '+5,0 pp');
  capture();
  await click(byId(ids.paretoReason)[0]!); capture();
  await openSelect(ids.scope); capture(); await key(one(ids.scope).querySelector('input')!, 'Escape'); await endMotion();
  await openSelect(ids.range); capture(); await key(one(ids.range).querySelector('input')!, 'Escape'); await endMotion();
  await select(ids.range, t(locale, 'range.last-7d')); capture();
  await view!.unmount(); view = undefined;
  await start({ ...dataset, hourlyOutput: [] }, locale); capture();
  expect(byId(ids.empty)).toHaveLength(1);
  await view!.unmount(); view = undefined;
  await start({ ...dataset, hourlyOutput: [hour(-1, { goodUnits: 0, scrapUnits: 0, downtime: [] })] }, locale); capture();
  await view!.unmount(); view = undefined;
  await start({ ...known, hourlyOutput: known.hourlyOutput.map(h => h.hourStart < dataset.now - 8 * HOUR ? { ...h, goodUnits: 0, scrapUnits: 0 } : h) }, locale); capture();
  await view!.unmount(); view = undefined;
  // Current live production with no completed Shift history exercises its independent empty.
  view = await mountApp('#/performance', { dataset: { ...dataset, hourlyOutput: [] }, languages: [locale], search: '?tick=100' });
  await select(ids.range, t(locale, 'range.last-24h')); capture();
  expect([...keys].filter(key => !seen.has(key))).toEqual([]);
  expect(document.body.textContent).not.toContain('[[');
  if (locale === 'pt-BR') expect(document.documentElement.lang).toBe('pt-BR');
});

it.each(['en', 'pt-BR'] as const)('translates Shift IDs and distinguishes previous Quality with no units in %s', async locale => {
  await start({ ...known, hourlyOutput: known.hourlyOutput.map(h => h.hourStart < dataset.now - 8 * HOUR ? { ...h, goodUnits: 0, scrapUnits: 0 } : h) }, locale);
  expect(shiftRows().slice(0, 3).map(row => row.cells[0]!.textContent)).toEqual(locale === 'en' ? ['Shift 3', 'Shift 2', 'Shift 1'] : ['Turno 3', 'Turno 2', 'Turno 1']);
  expect(text(ids.quality)).toContain(t(locale, 'performance.previous-quality-empty'));
  expect(text(ids.quality)).not.toContain(t(locale, 'performance.quality-empty'));
  expect(one(ids.quality).querySelector('.ant-statistic-title')?.textContent).toBe(t(locale, 'performance.quality'));
});

it.each(['en', 'pt-BR'] as const)('identifies current Quality when only the current range has no units in %s', async locale => {
  await start({ ...known, hourlyOutput: known.hourlyOutput.map(h => h.hourStart >= dataset.now - 8 * HOUR ? { ...h, goodUnits: 0, scrapUnits: 0 } : h) }, locale);
  expect(text(ids.quality)).not.toContain(t(locale, 'performance.previous-quality-empty'));
  expect(text(ids.quality)).toContain(t(locale, 'performance.quality-empty'));
  expect(one(ids.quality).querySelector('.ant-typography')?.textContent).toBe(t(locale, 'performance.quality'));
});

it('passes only primitive Select option attributes and clears reason selection on scope changes', async () => {
  await start();
  await click(byId(ids.paretoReason)[0]!);
  await openSelect(ids.scope);
  for (const option of document.querySelectorAll('.ant-select-item-option')) {
    expect([...option.attributes].some(attribute => attribute.value.includes('[object Object]'))).toBe(false);
    for (const attribute of ['scope', 'name', 'kind']) expect(option.hasAttribute(attribute)).toBe(false);
  }
  await key(one(ids.scope).querySelector('input')!, 'Escape'); await endMotion();
  await select(ids.scope, 'Line · E1 · Extrusion Line 1');
  expect(document.querySelector('.ant-descriptions')).toBeNull();
  await select(ids.scope, 'Site');
  expect([...byId(ids.paretoReason)].map(el => el.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
});

it('selects a reason from a real chart series click', async () => {
  const original = registration.init;
  const engines: ReturnType<typeof original>[] = [];
  vi.spyOn(registration, 'init').mockImplementation((...args) => { const chart = original(...args); engines.push(chart); return chart; });
  await start();
  const chart = engines.find(engine => engine.getDom() === one(ids.pareto).querySelector('[role="img"]'))!;
  await act(() => { chart.trigger('click', { type: 'click', componentType: 'series', componentSubType: 'bar', componentIndex: 0, seriesType: 'bar', seriesIndex: 0, seriesName: 'Downtime minutes', name: 'Minor stops', dataIndex: 1, data: {}, dataType: 'main', value: 80, color: '#000', $vars: ['seriesName', 'name', 'value'] }); });
  expect(byId(ids.paretoReason)[1]!.getAttribute('aria-pressed')).toBe('true');
  expect(document.querySelector('.ant-descriptions-item-content')?.textContent).toBe('Minor stops');
});

it('keeps fixed range arrays and chart options stable across timer ticks while Last 24 hours refreshes', async () => {
  vi.useFakeTimers();
  let now = 0;
  const builds = vi.spyOn(core, 'performanceStateView');
  const original = registration.init;
  const updates: ReturnType<typeof vi.spyOn>[] = [];
  vi.spyOn(registration, 'init').mockImplementation((...args) => { const chart = original(...args); updates.push(vi.spyOn(chart, 'setOption')); return chart; });
  view = await mountApp('#/performance', { dataset, search: '', now: () => now });
  await act(async () => { await Promise.resolve(); });
  const current = () => builds.mock.results.at(-1)!.value as core.PerformanceView;
  const fixed = current();
  const count = builds.mock.calls.length;
  const optionCalls = () => updates.reduce((sum, update) => sum + update.mock.calls.length, 0);
  const initialOptions = optionCalls();
  for (const time of [100_000, 30_000_000]) {
    now = time;
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(builds).toHaveBeenCalledTimes(count);
    for (const field of ['pareto', 'output', 'shifts'] as const) expect(current()[field]).toBe(fixed[field]);
    expect(optionCalls()).toBe(initialOptions);
  }
  await openSelect(ids.range);
  await click([...document.querySelectorAll('.ant-select-item-option')].find(el => el.textContent === 'Last 24 hours')!);
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  const rolling = current();
  const beforeUpdate = optionCalls();
  now += 100_000;
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  for (const field of ['pareto', 'output', 'shifts'] as const) expect(current()[field]).not.toBe(rolling[field]);
  expect(optionCalls()).toBeGreaterThan(beforeUpdate);
});

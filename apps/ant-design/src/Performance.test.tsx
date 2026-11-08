// @vitest-environment happy-dom
import {
  TEST_IDS, generateMockDataset, t, type HourlyRecord, type Locale, type MessageKey, type MockDataset,
} from '@swatchbook/core';
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
  // 0.5 × 0.5 × 0.8 = 0.2. Previous: 1 × 0.8 × 0.75 = 0.6.
  for (const [id, before, delta] of [
    [ids.oee, '60.0%', '-40.0 pp'], [ids.availability, '100.0%', '-50.0 pp'],
    [ids.performance, '80.0%', '-30.0 pp'], [ids.quality, '75.0%', '+5.0 pp'],
  ]) {
    expect(text(id!)).toContain(before);
    expect(text(id!)).toContain(delta);
    expect(one(id!).getAttribute('role')).toBe('group');
    expect(one(id!).getAttribute('aria-label')).toBeTruthy();
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
  expect(value(ids.oee)).not.toBe('20.0%');
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
  const summaryBlock = () => one(ids.pareto).closest('.ant-card-body')!.lastElementChild!;
  const summary = () => [...summaryBlock().querySelectorAll('.ant-typography')].at(-1)!.textContent;
  expect(summaryBlock().querySelector('strong')?.textContent).toBe('Selected downtime reason');
  expect(summaryBlock().querySelector('[role="status"], [role="alert"], [aria-live]')).toBeNull();
  expect(summaryBlock().closest('[role="status"], [role="alert"], [aria-live]')).toBeNull();
  expect(summary()).toBe('Minor stops · Downtime minutes: 80 · Share of total downtime: 33.3%');
  await act(() => reasons[0]!.focus());
  await key(document.activeElement!, 'Enter');
  expect(reasons[0]!.getAttribute('aria-pressed')).toBe('true');
  expect(summary()).toBe('Changeover · Downtime minutes: 160 · Share of total downtime: 66.7%');
  await act(() => reasons[1]!.focus());
  await key(document.activeElement!, ' ');
  expect(reasons[1]!.getAttribute('aria-pressed')).toBe('true');
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
    const rendered = [document.body.textContent, ...[...document.querySelectorAll('[aria-label], [title]')].flatMap(el => [el.getAttribute('aria-label'), el.getAttribute('title')])].join('\n');
    for (const key of keys) if (rendered.includes(t(locale, key))) seen.add(key);
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
  // Current live production with no completed Shift history exercises its independent empty.
  view = await mountApp('#/performance', { dataset: { ...dataset, hourlyOutput: [] }, languages: [locale], search: '?tick=100' });
  await select(ids.range, t(locale, 'range.last-24h')); capture();
  expect([...keys].filter(key => !seen.has(key))).toEqual([]);
  expect(document.body.textContent).not.toContain('[[');
  if (locale === 'pt-BR') expect(document.documentElement.lang).toBe('pt-BR');
});

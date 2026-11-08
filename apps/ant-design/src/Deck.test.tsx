// @vitest-environment happy-dom
import {
  TEST_IDS, en, ptBR, t, tCount, formatTagValue, stopReasonLabels, lineStatusLabels, type LineId,
} from '@swatchbook/core';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { byId, choose, click, mountApp, memoryStorage, endMotion, one, openDialogs, openSelect, options, pickOption, plantState } from './test-utils';

const ids = TEST_IDS.deck;
let view: Awaited<ReturnType<typeof mountApp>> | undefined;
beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });
afterEach(async () => { await view?.unmount(); view = undefined; history.replaceState(null, '', '/'); vi.useRealTimers(); });
const text = (id: string) => one(id).textContent ?? '';
const enabled = (id: string) => !(one(id) as HTMLButtonElement).disabled;
async function line(id: LineId) { await pickOption(ids.lineSelect, id); }
const events = () => plantState().events;

it('shows E1 at tick 0 in Alarm with one Critical Alarm and the right buttons', async () => {
  view = await mountApp('#/deck');
  expect(text(ids.lineStatus)).toContain(t('en', lineStatusLabels.alarm));
  expect(text(ids.alarmBanner)).toContain(tCount('en', 'deck.alarm-count', 1));
  expect(enabled(ids.pause)).toBe(true);
  expect(enabled(ids.resume)).toBe(false);
  expect(enabled(ids.estop)).toBe(true);
  expect(enabled(ids.reset)).toBe(false);
  expect(enabled(ids.handover)).toBe(true);
  expect(byId(ids.stopReason)).toHaveLength(0);
});

it('lists every Line with its status in the selector', async () => {
  view = await mountApp('#/deck');
  await openSelect(ids.lineSelect);
  const shown = options();
  expect(shown).toHaveLength(plantState().dataset.lines.length);
  const statusLabels = Object.values(lineStatusLabels).map(key => t('en', key));
  for (const option of shown) expect(statusLabels.some(label => option.textContent?.includes(label)), option.textContent ?? '').toBe(true);
  await pickOption(ids.lineSelect, 'A2');
  expect(text(ids.lineStatus)).toContain(t('en', lineStatusLabels.stopped));
});

it('names every Line option and the Batch progress for assistive technology, in both languages', async () => {
  view = await mountApp('#/deck');
  await openSelect(ids.lineSelect);
  const named = [...document.querySelectorAll('[role="option"]')].map(o => o.getAttribute('aria-label'));
  // The list is virtual, so only the rows near the top are in the DOM.
  expect(named.length).toBeGreaterThan(0);
  for (const label of named) expect(label, String(label)).toMatch(/^[A-Z]+\d /);
  expect(named.some(label => label?.includes(t('en', lineStatusLabels.alarm)))).toBe(true);
  const bar = one(ids.batchProgress).querySelector('[role="progressbar"]')!;
  expect(bar.getAttribute('aria-label')).toBe(en['deck.batch']);
  expect(bar.getAttribute('aria-valuetext')).toMatch(/\d.* \d/);
  const icon = one(ids.alarmBanner).querySelector('[role="img"]')!;
  expect(icon.getAttribute('aria-hidden')).toBe('true');
});

it('keeps the selected Line when the language or the theme changes', async () => {
  view = await mountApp('#/deck');
  await line('A2');
  await choose(TEST_IDS.shell.language, en['language.portuguese']);
  await choose(TEST_IDS.shell.theme, ptBR['theme.dark']);
  expect(text(ids.lineSelect)).toContain('A2');
});

it('renders the banner as a labelled region, not an assertive alert, and starts it collapsed on every Line', async () => {
  view = await mountApp('#/deck');
  const banner = one(ids.alarmBanner);
  expect(banner.getAttribute('role')).toBe('region');
  expect(banner.getAttribute('aria-label')).toBe(en['deck.alarm-banner']);
  await click(banner.querySelector('button')!);
  expect(banner.querySelector('table')).not.toBeNull();
  await line('E2');
  await line('E1');
  expect(one(ids.alarmBanner).querySelector('table')).toBeNull();
});

it('shows the assigned labels: Shift handover action, KPI heading, produced and target', async () => {
  view = await mountApp('#/deck');
  expect(text(ids.handover)).toBe(en['action.shift-handover']);
  expect(document.body.textContent).toContain(en['deck.kpis']);
  expect(text(ids.batch)).toContain(en['deck.batch-produced']);
  expect(text(ids.batch)).toContain(en['deck.batch-target']);
});

it('shows the KPI empty note only when the Line has no production', async () => {
  view = await mountApp('#/deck');
  expect(byId(ids.kpiEmpty)).toHaveLength(0);
  expect(byId(ids.shiftEmpty)).toHaveLength(0);
  await line('C1');
  expect(byId(ids.batchEmpty)).toHaveLength(1);
  expect(text(ids.kpiEmpty)).toBe(en['deck.kpi-empty']);
});

it('stores only language, theme and density, and no Plant State', async () => {
  const storage = memoryStorage();
  view = await mountApp('#/deck', { storage });
  await click(one(ids.pause));
  await choose(TEST_IDS.shell.language, en['language.portuguese']);
  expect([...storage.data.keys()]).toEqual(['swatchbook.preferences']);
  expect(Object.keys(JSON.parse(storage.data.get('swatchbook.preferences')!)).sort()).toEqual(['density', 'language', 'theme']);
});

it('ignores a screen shortcut while the Emergency stop dialog is open', async () => {
  view = await mountApp('#/deck');
  await click(one(ids.estop));
  await act(() => { document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true })); });
  expect(location.hash).toBe('#/deck');
});

it('shows Fault on A2 and the empty Batch state on C1', async () => {
  view = await mountApp('#/deck');
  await line('A2');
  expect(text(ids.stopReason)).toContain(t('en', stopReasonLabels.fault));
  expect(byId(ids.batchEmpty)).toHaveLength(0);
  expect(text(ids.kpiCycle)).toContain(en['common.none']);
  await line('C1');
  expect(text(ids.batchEmpty)).toContain(en['deck.batch-empty']);
  expect(byId(ids.batchProgress)).toHaveLength(0);
  expect(text(ids.kpiCycle)).toContain(en['deck.kpi-speed']);
});

it('has every required id once when its element exists', async () => {
  view = await mountApp('#/deck');
  const always = [ids.lineSelect, ids.lineStatus, ids.batch, ids.batchProgress, ids.kpiOee, ids.kpiOutput, ids.kpiCycle, ids.kpiScrap, ids.alarmBanner, ids.pause, ids.resume, ids.estop, ids.reset, ids.handover, ids.shift];
  for (const id of always) expect(byId(id), id).toHaveLength(1);
  for (const id of [ids.stopReason, ids.batchEmpty, ids.estopConfirm, ids.handoverNote]) expect(byId(id), id).toHaveLength(0);
  await click(one(ids.estop));
  expect(byId(ids.estopConfirm)).toHaveLength(1);
  await click(document.querySelector<HTMLElement>('.ant-modal-close')!);
  await endMotion();
  expect(byId(ids.estopConfirm)).toHaveLength(0);
  await line('A2');
  expect(byId(ids.stopReason)).toHaveLength(1);
});

it('shows the Batch block and KPIs from the view with formatted values', async () => {
  view = await mountApp('#/deck');
  const batch = text(ids.batch);
  for (const label of ['common.batch-id', 'term.lot', 'common.product', 'event-target.recipe-version', 'common.start', 'deck.batch-elapsed'] as const) expect(batch).toContain(en[label]);
  expect(text(ids.batchProgress)).toContain('37.5%');
  expect(text(ids.kpiOee)).toContain('65.4%');
  expect(text(ids.kpiCycle)).toContain(formatTagValue('en', 2.11, 'm/min'));
  expect(text(ids.kpiCycle)).toContain('m/min');
  await line('A1');
  expect(text(ids.kpiCycle)).toContain('120');
  expect(text(ids.kpiCycle)).toContain(en['deck.kpi-takt']);
});

it('shows the shift name and time left', async () => {
  view = await mountApp('#/deck');
  expect(text(ids.shift)).toContain(en['deck.shift-remaining']);
  expect(text(ids.shift)).toMatch(/Shift [123]/);
});

it('minimizes the banner, expands it with a list, and cannot expand at zero', async () => {
  view = await mountApp('#/deck');
  const banner = () => one(ids.alarmBanner);
  const toggle = () => banner().querySelector<HTMLButtonElement>('button')!;
  expect(toggle().disabled).toBe(false);
  expect(banner().textContent).toContain(en['action.expand-banner']);
  expect(banner().textContent).not.toContain(en['term.machine']);
  await click(toggle());
  expect(banner().textContent).toContain(en['action.collapse-banner']);
  expect(banner().textContent).toContain(en['term.machine']);
  expect(banner().textContent).toContain(en['common.message']);
  expect(banner().textContent).toContain(en['common.age']);
  await click(toggle());
  expect(banner().textContent).not.toContain(en['common.age']);
  await line('E2');
  expect(banner().textContent).toContain(tCount('en', 'deck.alarm-count', 0));
  expect(toggle().disabled).toBe(true);
});

it('pauses and resumes a Line and writes Event Log entries', async () => {
  view = await mountApp('#/deck');
  await line('E2');
  const before = events().length;
  await click(one(ids.pause));
  expect(text(ids.lineStatus)).toContain(t('en', lineStatusLabels.stopped));
  expect(text(ids.stopReason)).toContain(t('en', stopReasonLabels.paused));
  expect(enabled(ids.pause)).toBe(false);
  expect(enabled(ids.resume)).toBe(true);
  expect(events().length).toBe(before + 1);
  expect(events().at(-1)!.action).toBe('pause');
  await click(one(ids.resume));
  expect(text(ids.lineStatus)).toContain(t('en', lineStatusLabels.running));
  expect(byId(ids.stopReason)).toHaveLength(0);
  expect(events().at(-1)!.action).toBe('resume');
});

it('stops only after confirming, latches until Reset, and Escape closes the dialog', async () => {
  view = await mountApp('#/deck');
  await line('E2');
  await click(one(ids.estop));
  expect(document.body.textContent).toContain(en['deck.estop-confirm.title']);
  expect(document.body.textContent).toContain(en['deck.estop-confirm.body']);
  expect(text(ids.lineStatus)).toContain(t('en', lineStatusLabels.running));
  const wrap = document.querySelector<HTMLElement>('.ant-modal-wrap')!;
  await act(() => { wrap.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })); });
  await endMotion();
  expect(openDialogs()).toHaveLength(0);
  expect(text(ids.lineStatus)).toContain(t('en', lineStatusLabels.running));
  await click(one(ids.estop));
  await click(one(ids.estopConfirm));
  expect(text(ids.lineStatus)).toContain(t('en', lineStatusLabels.stopped));
  expect(text(ids.stopReason)).toContain(t('en', stopReasonLabels['emergency-stop']));
  expect(events().at(-1)!.action).toBe('emergency-stop');
  expect(enabled(ids.resume)).toBe(false);
  expect(enabled(ids.reset)).toBe(true);
  await click(one(ids.reset));
  expect(events().at(-1)!.action).toBe('reset');
  expect(enabled(ids.reset)).toBe(false);
});

it('requires a note for the Shift handover and records it', async () => {
  view = await mountApp('#/deck');
  await click(one(ids.handover));
  const submit = () => [...document.querySelectorAll<HTMLButtonElement>('.ant-modal button')].find(b => b.textContent === en['action.submit-handover'])!;
  const before = events().length;
  await click(submit());
  expect(document.body.textContent).toContain(en['plant-error.note-required']);
  expect(events().length).toBe(before);
  const note = one(ids.handoverNote) as HTMLTextAreaElement;
  expect(note.placeholder).toBe(en['deck.handover-placeholder']);
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(note, 'All good');
    note.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(submit());
  expect(events().length).toBe(before + 1);
  expect(events().at(-1)!.action).toBe('shift-handover');
  await endMotion();
  expect(openDialogs()).toHaveLength(0);
});

it('renders in Portuguese without fallback keys', async () => {
  view = await mountApp('#/deck', { languages: ['pt-BR'] });
  const banner = one(ids.alarmBanner);
  await click(banner.querySelector('button')!);
  expect(document.documentElement.lang).toBe('pt-BR');
  expect(text(ids.lineStatus)).toContain(ptBR['line-status.alarm']);
  expect(document.body.textContent).not.toContain('[[');
  await click(one(ids.estop));
  expect(document.body.textContent).toContain(ptBR['deck.estop-confirm.title']);
  expect(document.body.textContent).not.toContain('[[');
});

it('freezes the clock with ?tick=0 and moves with a live clock', async () => {
  vi.useFakeTimers();
  let clock = 0;
  view = await mountApp('#/deck?tick=0', { search: '', now: () => clock });
  const frozen = text(ids.batch);
  clock = 600_000;
  await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
  expect(text(ids.batch)).toBe(frozen);
  await view.unmount();
  clock = 0;
  view = await mountApp('#/deck', { search: '', now: () => clock });
  const live = text(ids.batch);
  clock = 600_000;
  await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
  expect(text(ids.batch)).not.toBe(live);
});

// @vitest-environment happy-dom
import { TEST_IDS, generateMockDataset, recipeVersionView, t, type MessageKey, type Locale, type MockDataset } from '@swatchbook/core';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { recipesCoverage } from '../../../packages/core/src/i18n/strings/recipes-coverage';
import { byId, click, endMotion, mountApp, one, openSelect, plantState } from './test-utils';

const dataset = generateMockDataset();
const ids = TEST_IDS.recipes;
let app: Awaited<ReturnType<typeof mountApp>> | undefined;
beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); vi.spyOn(console, 'error'); });
afterEach(async () => { await app?.unmount(); app = undefined; expect(vi.mocked(console.error).mock.calls).toEqual([]); vi.useRealTimers(); vi.restoreAllMocks(); history.replaceState(null, '', '/'); });
const start = async (locale: Locale = 'en', data: MockDataset = dataset) => { app = await mountApp('#/recipes', { dataset: data, languages: [locale] }); };
const rows = () => [...one(ids.library).querySelectorAll('tbody tr')].filter(row => /^R[0-9]{2}$/.test(row.querySelector('td')?.textContent ?? ''));
const recipeIds = () => rows().map(row => row.querySelector('td')!.textContent);
const button = (label: string, scope: ParentNode = document) => [...scope.querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent === label)!;
async function input(element: Element, value: string) {
  const target = element instanceof HTMLInputElement ? element : element.querySelector('input')!;
  await act(() => { target.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, value); target.dispatchEvent(new Event('input', { bubbles: true })); target.dispatchEvent(new Event('change', { bubbles: true })); });
}
const setNativeValue = (target: HTMLInputElement, value: string) => Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, value);
/** Types like a user: one input event per character, replacing the current content. */
async function type(target: HTMLInputElement, text: string) {
  await act(() => target.focus());
  for (let length = 1; length <= text.length; length++) await act(() => { setNativeValue(target, text.slice(0, length)); target.dispatchEvent(new Event('input', { bubbles: true })); });
}
/** Types, then commits the way a user does: blur by default, or Enter. */
async function edit(target: HTMLInputElement, text: string, commit: 'blur' | 'enter' = 'blur') {
  await type(target, text);
  await act(() => { if (commit === 'blur') target.blur(); else target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
}
async function pick(id: string, label: string) {
  await openSelect(id);
  const option = [...document.querySelectorAll('[role="option"]')].find(el => el.textContent === label);
  if (!option) throw new Error(`missing option ${label}`);
  await click(option); await endMotion();
}
async function openRecipe(id: string) {
  const row = rows().find(row => row.querySelector('td')?.textContent === id)!;
  await click(row.querySelector('button')!);
}

it('browses all Recipes, filters latest status and Line type, searches names and retains filters in the whole Screen empty state', async () => {
  await start();
  expect(rows()).toHaveLength(40);
  expect(recipeIds().slice(0, 5)).toEqual(['R01', 'R02', 'R03', 'R04', 'R05']);
  expect(rows()[0]!.querySelectorAll('td')[4]!.textContent).toBe('3');
  expect(rows()[0]!.querySelectorAll('td')[5]!.textContent).toBe('Draft');
  expect(document.body.textContent).toContain('Select a Recipe Version to see its Steps.');
  await pick(ids.filterLineType, 'Extrusion');
  expect(recipeIds()).toEqual(['R01', 'R06', 'R11', 'R16', 'R21', 'R26', 'R31', 'R36']);
  await pick(ids.filterStatus, 'Approved');
  expect(recipeIds()).toEqual(['R11', 'R16', 'R26', 'R31']);
  await input(one(ids.search), 'WIN-TT'); expect(recipeIds()).toEqual(['R11']);
  await input(one(ids.search), 'missing');
  expect(one(ids.empty).textContent).toContain('No Recipes to display.');
  expect(byId(ids.libraryEmpty)).toHaveLength(0);
  await input(one(ids.search), ''); expect(recipeIds()).toEqual(['R11', 'R16', 'R26', 'R31']);
  await act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })); });
  expect(document.activeElement).toBe(one(ids.search));
});

const parameter = (name: string) => [...byId(ids.parameter)].find(row => row.getAttribute('aria-label') === name)!;
const field = (name: string, label: string) => parameter(name).querySelector<HTMLInputElement>(`input[aria-label="${name}, ${label}"]`)!;
const description = (element: Element) => (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean).map(id => document.getElementById(id)!.textContent).join(' ');

it('opens the latest Version on row click and exposes the selected Recipe across version choices', async () => {
  await start();
  const first = rows()[0]!;
  expect(first.getAttribute('aria-selected')).toBe('false');
  expect(first.getAttribute('aria-current')).toBeNull();
  await click(first.querySelectorAll('td')[1]!);
  expect(one(ids.version).textContent).toContain('R01 v3');
  expect(first.getAttribute('aria-selected')).toBe('true');
  expect(first.getAttribute('aria-current')).toBe('true');
  expect(rows()[1]!.getAttribute('aria-selected')).toBe('false');
  expect(rows()[1]!.getAttribute('aria-current')).toBeNull();
  await pick(ids.versionChoice, 'R01 v2 · Approved');
  expect(first.getAttribute('aria-selected')).toBe('true');
  await click(rows()[1]!);
  expect(one(ids.version).textContent).toContain('R02 v1');
  expect(first.getAttribute('aria-selected')).toBe('false');
  expect(first.getAttribute('aria-current')).toBeNull();
  expect(rows()[1]!.getAttribute('aria-selected')).toBe('true');
  expect(rows()[1]!.getAttribute('aria-current')).toBe('true');
});

it.each([
  ['en', ['R01 v3 · Draft', 'R01 v2 · Approved', 'R01 v1 · Approved']],
  ['pt-BR', ['R01 v3 · Rascunho', 'R01 v2 · Aprovada', 'R01 v1 · Aprovada']],
] as const)('labels each version choice with the Recipe, version number and status in %s', async (locale, labels) => {
  await start(locale); await openRecipe('R01');
  await openSelect(ids.versionChoice);
  expect([...document.querySelectorAll('[role="option"]')].map(element => element.textContent)).toEqual(labels);
});

it('opens latest and older Versions, exposes real Parameter tables and explains Approved read-only on focus', async () => {
  await start(); await openRecipe('R01');
  expect(one(ids.version).textContent).toContain('R01 v3');
  expect(byId(ids.step)).toHaveLength(4);
  expect(byId(ids.parameter)).toHaveLength(11);
  expect(byId(ids.parameter)[0]!.tagName).toBe('TR');
  expect(one(ids.rule1).textContent).toContain('Failing');
  expect(one(ids.rule1).textContent).toContain('Barrel zone 3: 198.0 °C violates the maximum rule limit of 195.0 °C.');
  expect(one(ids.rule1).textContent).toContain('Barrel zone 2 and Barrel zone 3: adjacent-zone difference 22.0 °C exceeds 15.0 °C.');
  expect(one(ids.rule2).textContent).toContain('Passing');
  expect(one(ids.rule3).textContent).toContain('Not applicable');
  expect(document.activeElement?.textContent).toBe('Recipe Version details');
  await pick(ids.versionChoice, 'R01 v2 · Approved');
  expect(one(ids.version).textContent).toContain('Approved version. Create a new Draft to edit.');
  const target = field('Barrel zone 3', 'Setpoint');
  expect(target.value).toBe('180'); expect(target.readOnly).toBe(true);
  expect(target.getAttribute('aria-disabled')).toBe('true');
  expect(description(target)).toBe('Approved version. Create a new Draft to edit.');
  await act(() => target.focus()); await endMotion();
  expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Approved version. Create a new Draft to edit.');
  const before = plantState(); await edit(target, '181'); expect(plantState()).toBe(before);
  await input(one(ids.search), 'missing');
  expect(one(ids.libraryEmpty).textContent).toContain('No Recipes match the filters.');
  expect(byId(ids.empty)).toHaveLength(0); expect(byId(ids.version)).toHaveLength(1);
});

it('creates and focuses a new Draft, refuses a second from the Approved Version and records only New Draft', async () => {
  await start(); await openRecipe('R11');
  expect(one(ids.version).textContent).toContain('R11 v2');
  await click(one(ids.newDraft));
  expect(one(ids.version).textContent).toContain('R11 v3');
  expect(field('Barrel zone 1', 'Setpoint').readOnly).toBe(false);
  expect(document.activeElement?.textContent).toBe('Recipe Version details');
  expect(plantState().events.at(-1)).toMatchObject({ action: 'recipe-new-draft', target: 'R11-v3' });
  const before = plantState();
  await pick(ids.versionChoice, 'R11 v2 · Approved');
  expect(one(ids.newDraft).getAttribute('aria-disabled')).toBe('true');
  expect(description(one(ids.newDraft))).toBe('A draft already exists for this recipe.');
  await click(one(ids.newDraft));
  expect(plantState()).toBe(before);
  expect(one(ids.version).querySelector('[role="status"]')).toBeNull();
  expect(one(ids.version).textContent).toContain('R11 v2');
});

it.each([
  ['en', 'Barrel zone 3', ['Barrel zone 3, Minimum', 'Barrel zone 3, Setpoint', 'Barrel zone 3, Maximum']],
  ['pt-BR', 'Zona 3 do cilindro', ['Zona 3 do cilindro, Mínimo', 'Zona 3 do cilindro, Setpoint', 'Zona 3 do cilindro, Máximo']],
] as const)('names every Parameter input with its Parameter and visible field label in %s', async (locale, name, names) => {
  await start(locale); await openRecipe('R01');
  const inputs = [...one(ids.version).querySelectorAll('input[role="spinbutton"]')];
  expect(inputs).toHaveLength(33);
  const labels = inputs.map(element => element.getAttribute('aria-label'));
  expect(new Set(labels).size).toBe(33);
  expect([...parameter(name).querySelectorAll('input')].map(element => element.getAttribute('aria-label'))).toEqual(names);
});

it.each([
  ['en', 'R01, Extrusion recipe for WIN-1L-60', 'Open Recipe Version R01, Extrusion recipe for WIN-1L-60'],
  ['pt-BR', 'R01, Receita de extrusão para WIN-1L-60', 'Abrir versão da receita R01, Receita de extrusão para WIN-1L-60'],
] as const)('names each library row and its Open button after the Recipe in %s', async (locale, rowName, buttonName) => {
  await start(locale);
  const row = rows()[0]!;
  expect(row.getAttribute('aria-label')).toBe(rowName);
  expect(row.querySelector('button')!.getAttribute('aria-label')).toBe(buttonName);
  expect(new Set(rows().map(element => element.querySelector('button')!.getAttribute('aria-label'))).size).toBe(40);
});

it('commits a typed Parameter on blur or Enter only, without intermediate dispatches, errors or rule announcements', async () => {
  await start(); await openRecipe('R01');
  const target = field('Barrel zone 3', 'Setpoint');
  const summary = document.querySelector('aside [role="status"][aria-live="polite"]')!;
  const before = plantState(); const failing = summary.textContent;
  await type(target, '180');
  expect(target.value).toBe('180');
  expect(plantState()).toBe(before);
  expect(byId(ids.parameterError)).toHaveLength(0);
  expect(summary.textContent).toBe(failing);
  await act(() => target.blur());
  expect(plantState()).not.toBe(before);
  expect(summary.textContent).toContain('Barrel temperature window: Passing.');
  await edit(field('Barrel zone 3', 'Setpoint'), '192', 'enter');
  expect(summary.textContent).toContain('Barrel temperature window: Failing.');
  expect(target.value).toBe('192');
});

it('edits Draft Parameters, rejects an out-of-order field once, and checks barrel temperature on every accepted edit', async () => {
  await start(); await openRecipe('R01');
  const before = plantState();
  await edit(field('Barrel zone 3', 'Setpoint'), '180');
  expect(one(ids.rule1).textContent).toBe('Barrel temperature windowPassing');
  expect(field('Barrel zone 3', 'Setpoint').value).toBe('180');
  expect(plantState().events).toHaveLength(before.events.length);
  const passing = plantState();
  await edit(field('Barrel zone 3', 'Minimum'), '190');
  expect(plantState()).toBe(passing);
  expect(one(ids.parameterError).textContent).toBe('Minimum must not exceed setpoint, and setpoint must not exceed maximum.');
  expect(one(ids.parameterError).getAttribute('role')).toBe('status');
  expect(field('Barrel zone 3', 'Minimum').getAttribute('aria-invalid')).toBe('true');
  await act(() => field('Barrel zone 3', 'Minimum').blur());
  expect(field('Barrel zone 3', 'Minimum').value).toBe('165');
  expect(one(ids.parameterError).textContent).toBe('Minimum must not exceed setpoint, and setpoint must not exceed maximum.');
  await edit(field('Barrel zone 3', 'Minimum'), '160');
  expect(byId(ids.parameterError)).toHaveLength(0);
  await edit(field('Barrel zone 3', 'Setpoint'), '164');
  expect(one(ids.rule1).textContent).toContain('Barrel zone 3: 164.0 °C is below the minimum of 165.0 °C.');
  await edit(field('Barrel zone 3', 'Setpoint'), '180');
  expect(one(ids.rule1).textContent).toBe('Barrel temperature windowPassing');
  await edit(field('Barrel zone 3', 'Setpoint'), '192');
  expect(one(ids.rule1).textContent).toContain('Barrel zone 2 and Barrel zone 3: adjacent-zone difference 16.0 °C exceeds 15.0 °C.');
  await edit(field('Barrel zone 3', 'Setpoint'), '180');
  expect(one(ids.rule1).textContent).toBe('Barrel temperature windowPassing');
  await edit(field('Barrel zone 3', 'Setpoint'), '198');
  expect(one(ids.rule1).textContent).toContain('Barrel zone 3: 198.0 °C violates the maximum rule limit of 195.0 °C.');
  await edit(field('Barrel zone 3', 'Setpoint'), '180');
  expect(one(ids.rule1).textContent).toBe('Barrel temperature windowPassing');
});

it('keeps a rejected Minimum explanation after Tab until refocus, input or a successful edit to the same Parameter', async () => {
  await start(); await openRecipe('R01');
  await edit(field('Barrel zone 3', 'Setpoint'), '190');
  const minimum = field('Barrel zone 3', 'Minimum');
  const setpoint = field('Barrel zone 3', 'Setpoint');
  const errorText = 'Minimum must not exceed setpoint, and setpoint must not exceed maximum.';
  const errors = () => [...document.querySelectorAll('[role="status"], [role="alert"]')].filter(element => element.textContent === errorText);
  const committedMinimum = () => {
    const detail = recipeVersionView(plantState(), 'R01-v3');
    if ('error' in detail) throw new Error(detail.error);
    return detail.steps.flatMap(step => step.parameters).find(parameter => parameter.key === 'barrel-zone-3')!.min;
  };
  // happy-dom does not perform native Tab traversal; move to the next named field.
  const tab = () => act(() => {
    minimum.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    setpoint.focus();
    setpoint.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', bubbles: true }));
  });
  expect(minimum.value).toBe('165');
  expect(setpoint.value).toBe('190');
  expect(errors()).toHaveLength(0);
  await type(minimum, '999');
  expect(minimum.value).toBe('999');
  expect(errors(), 'no explanation before the value is committed').toHaveLength(0);
  expect(minimum.getAttribute('aria-invalid')).toBe('false');
  await tab();
  expect(minimum.value).toBe('165');
  expect(committedMinimum()).toBe(165);
  expect(errors(), 'the explanation must remain visible after Tab reverts the rejected value').toHaveLength(1);
  expect(description(minimum)).toBe(errorText);
  expect(minimum.getAttribute('aria-invalid')).toBe('true');
  await act(() => minimum.focus());
  expect(errors()).toHaveLength(0);
  expect(minimum.getAttribute('aria-invalid')).toBe('false');
  await edit(minimum, '999');
  expect(errors()).toHaveLength(1);
  await type(minimum, '165');
  expect(errors()).toHaveLength(0);
  await act(() => minimum.blur());
  expect(errors()).toHaveLength(0);
  expect(committedMinimum()).toBe(165);
  await type(minimum, '999');
  await tab();
  expect(minimum.value).toBe('165');
  expect(errors()).toHaveLength(1);
  await edit(field('Barrel zone 2', 'Setpoint'), '175');
  expect(errors()).toHaveLength(1);
  await edit(setpoint, '180');
  expect(setpoint.value).toBe('180');
  expect(errors()).toHaveLength(0);
  await edit(minimum, '160');
  expect(errors()).toHaveLength(0);
  expect(minimum.value).toBe('160');
  expect(committedMinimum()).toBe(160);
});

it('shows a rejection once on Enter, keeps the rejected text until blur, then reverts without announcing it again', async () => {
  await start(); await openRecipe('R01');
  const minimum = field('Barrel zone 3', 'Minimum');
  await type(minimum, '999');
  expect(byId(ids.parameterError)).toHaveLength(0);
  await act(() => { minimum.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  const announcement = one(ids.parameterError);
  expect(announcement.textContent).toBe('Minimum must not exceed setpoint, and setpoint must not exceed maximum.');
  expect(minimum.value).toBe('999');
  await act(() => minimum.blur());
  expect(minimum.value).toBe('165');
  expect(one(ids.parameterError)).toBe(announcement);
});

it.each(['165', '-'])('clears a retained rejection on any input event, including %s without a numeric change', async typed => {
  await start(); await openRecipe('R01');
  const minimum = field('Barrel zone 3', 'Minimum');
  await edit(minimum, '999');
  await act(() => minimum.blur());
  expect(minimum.value).toBe('165');
  expect(one(ids.parameterError).textContent).toBe('Minimum must not exceed setpoint, and setpoint must not exceed maximum.');
  // Isolate input from focus: Ant does not emit onChange for these strings.
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(minimum, typed);
    minimum.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(byId(ids.parameterError)).toHaveLength(0);
  expect(minimum.getAttribute('aria-invalid')).toBe('false');
});

it('clears retained Parameter rejections on successful saves, including a no-op, version changes and discard', async () => {
  await start(); await openRecipe('R01');
  await edit(field('Barrel zone 3', 'Setpoint'), '180');
  const rejectAndBlur = async () => {
    const minimum = field('Barrel zone 3', 'Minimum');
    await edit(minimum, '999');
    await act(() => minimum.blur());
    expect(minimum.value).toBe('165');
    expect(one(ids.parameterError).textContent).toBe('Minimum must not exceed setpoint, and setpoint must not exceed maximum.');
  };
  for (const message of ['Draft saved.', 'No changes to save.']) {
    await rejectAndBlur();
    await click(one(ids.save));
    expect(byId(ids.parameterError)).toHaveLength(0);
    expect(one(ids.version).textContent).toContain(message);
  }
  await rejectAndBlur();
  await pick(ids.versionChoice, 'R01 v2 · Approved');
  expect(byId(ids.parameterError)).toHaveLength(0);
  await pick(ids.versionChoice, 'R01 v3 · Draft');
  expect(byId(ids.parameterError)).toHaveLength(0);
  await rejectAndBlur();
  await click(one(ids.discard));
  await click(button('Discard draft', document.querySelector('[role="dialog"]')!)); await endMotion();
  expect(byId(ids.parameterError)).toHaveLength(0);
  expect(byId(ids.version)).toHaveLength(0);
});

it('describes a focused blocked button and a focused read-only field with the reason once', async () => {
  await start(); await openRecipe('R01');
  await pick(ids.versionChoice, 'R01 v2 · Approved');
  const reason = 'Approved version. Create a new Draft to edit.';
  for (const target of [one(ids.save), field('Barrel zone 3', 'Setpoint')]) {
    await act(() => target.focus()); await endMotion();
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(reason);
    // The tooltip is the one description (Ant gives it a fixed id under test).
    expect(target.getAttribute('aria-describedby')).toBe(document.querySelector('[role="tooltip"]')!.id);
    await act(() => target.blur()); await endMotion();
  }
});

it.each(['Draft saved.', 'No changes to save.'])('keeps what is typed into a Parameter right after the save status "%s"', async message => {
  await start(); await openRecipe('R01');
  await edit(field('Barrel zone 3', 'Setpoint'), '190');
  await click(one(ids.save));
  if (message === 'No changes to save.') await click(one(ids.save));
  expect(one(ids.version).textContent).toContain(message);
  const setpoint = field('Barrel zone 3', 'Setpoint');
  await act(() => { setpoint.focus(); setpoint.select(); });
  for (const [length, shown] of [[1, '1'], [2, '18'], [3, '181']] as const) {
    await act(() => { setNativeValue(field('Barrel zone 3', 'Setpoint'), '181'.slice(0, length)); field('Barrel zone 3', 'Setpoint').dispatchEvent(new Event('input', { bubbles: true })); });
    expect(field('Barrel zone 3', 'Setpoint').value).toBe(shown);
    // The status only changes when the edit is committed: re-rendering the Version mid typing resets the field in a browser.
    expect(one(ids.version).textContent).toContain(message);
  }
  await act(() => field('Barrel zone 3', 'Setpoint').blur());
  expect(one(ids.version).textContent).not.toContain(message);
});

const steps = () => [...byId(ids.step)];
const stepNames = () => steps().map(step => step.getAttribute('aria-label'));
it('keeps all Dependency Rules and their live summary in a named complementary panel beside the Version', async () => {
  await start(); await openRecipe('R01');
  const panel = document.querySelector('aside[aria-label="Dependency check"]');
  expect(panel).not.toBeNull();
  for (const id of [ids.rule1, ids.rule2, ids.rule3, ids.rule4]) expect(panel!.contains(one(id))).toBe(true);
  expect(panel!.querySelector('[role="status"][aria-live="polite"]')?.textContent).toContain('Barrel temperature window: Failing.');
  expect(panel!.parentElement).toBe(one(ids.version).parentElement);
});

it('shows each Step kind once, with ordered controls before its labelled Parameter table', async () => {
  await start(); await openRecipe('R01');
  const first = steps()[0]!;
  expect(first.textContent?.match(/Preheat/g)).toHaveLength(1);
  expect(first.textContent).not.toContain('Step type:');
  expect([...first.querySelectorAll('button')].map(button => button.textContent)).toEqual(['Move up', 'Move down', 'Remove step']);
  expect(first.textContent!.indexOf('Remove step')).toBeLessThan(first.textContent!.indexOf('Step Parameters'));
  expect(first.querySelector('table')?.getAttribute('aria-label')).toBe('Step Parameters');
});

it('removes, adds and reorders Steps with keyboard controls, reasons at the ends and focus on the affected item', async () => {
  await start(); await openRecipe('R11'); await click(one(ids.newDraft));
  expect(stepNames()).toEqual(['Preheat', 'Ramp', 'Run', 'Cooldown']);
  const firstUp = button('Move up', steps()[0]!);
  expect(firstUp.getAttribute('aria-disabled')).toBe('true');
  expect(description(firstUp)).toBe('Already the first Step.');
  const lastDown = button('Move down', steps()[3]!);
  expect(description(lastDown)).toBe('Already the last Step.');
  const before = plantState(); await click(firstUp); expect(plantState()).toBe(before);
  await click(button('Remove step', steps()[3]!));
  expect(stepNames()).toEqual(['Preheat', 'Ramp', 'Run']);
  expect(document.activeElement).toBe(one(ids.addStep));
  await pick(ids.stepChoice, 'Cooldown'); await click(one(ids.addStep));
  expect(stepNames()).toEqual(['Preheat', 'Ramp', 'Run', 'Cooldown']);
  expect(document.activeElement).toBe(steps()[3]);
  await click(button('Move up', steps()[3]!));
  expect(stepNames()).toEqual(['Preheat', 'Ramp', 'Cooldown', 'Run']);
  expect(document.activeElement).toBe(button('Move up', steps()[2]!));
  await click(button('Move down', steps()[2]!));
  expect(stepNames()).toEqual(['Preheat', 'Ramp', 'Run', 'Cooldown']);
  expect(document.activeElement).toBe(button('Move down', steps()[3]!));
  expect(document.activeElement?.getAttribute('aria-disabled')).toBe('true');
  // The open tooltip is the one description of the focused button.
  expect(document.activeElement?.getAttribute('aria-describedby')).toBe(document.querySelector('[role="tooltip"]')!.id);
  expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Already the last Step.');
  expect(plantState().events.slice(dataset.events.length).map(event => event.action)).toEqual(['recipe-new-draft']);
});

it('explains blocked Save and Approve on focus, ignores clicks, then enables a repaired Draft and logs its actions', async () => {
  await start(); await openRecipe('R01');
  const before = plantState();
  for (const id of [ids.save, ids.approve]) {
    expect(one(id).getAttribute('aria-disabled')).toBe('true');
    expect(one(id).hasAttribute('disabled')).toBe(false);
    expect(description(one(id))).toBe('Resolve the failing dependency rules before continuing. Barrel temperature window');
    await act(() => one(id).focus()); await endMotion();
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Resolve the failing dependency rules before continuing. Barrel temperature window');
    await act(() => one(id).blur()); await endMotion();
  }
  await click(one(ids.save));
  expect(one(ids.rule1).textContent).toContain('Barrel temperature window');
  expect(plantState()).toBe(before);
  await click(one(ids.approve)); expect(plantState()).toBe(before);
  expect(one(ids.version).querySelector('[role="status"]')).toBeNull();
  await edit(field('Die pressure', 'Setpoint'), '250');
  expect(description(one(ids.save))).toBe('Resolve the failing dependency rules before continuing. Barrel temperature window and Die pressure limit');
  expect(description(one(ids.approve))).toBe('Resolve the failing dependency rules before continuing. Barrel temperature window and Die pressure limit');
  await edit(field('Die pressure', 'Setpoint'), '180');
  await edit(field('Barrel zone 3', 'Setpoint'), '180');
  for (const id of [ids.save, ids.approve]) {
    expect(one(id).getAttribute('aria-disabled')).toBe('false');
    expect(one(id).hasAttribute('aria-describedby')).toBe(false);
  }
  await click(one(ids.save));
  expect(plantState().events.at(-1)).toMatchObject({ action: 'recipe-save', target: 'R01-v3' });
  expect(one(ids.save).getAttribute('aria-disabled')).toBe('false');
  await click(one(ids.approve));
  expect(plantState().events.slice(dataset.events.length).map(event => event.action)).toEqual(['recipe-save', 'recipe-approve']);
  expect(field('Barrel zone 3', 'Setpoint').readOnly).toBe(true);
  expect(document.activeElement?.textContent).toBe('Recipe Version details');
  expect(one(ids.newDraft)).toBeDefined();
  for (const id of [ids.save, ids.approve]) {
    expect(one(id).getAttribute('aria-disabled')).toBe('true');
    expect(description(one(id))).toBe('Approved version. Create a new Draft to edit.');
    const approved = plantState(); await click(one(id)); expect(plantState()).toBe(approved);
  }
});

it.each([
  ['en', 'Draft saved.', 'No changes to save.', 'Barrel zone 3', 'Minimum', 'R01 v2 · Approved'],
  ['pt-BR', 'Rascunho salvo.', 'Nenhuma alteração para salvar.', 'Zona 3 do cilindro', 'Mínimo', 'R01 v2 · Aprovada'],
] as const)('announces every Save politely, separates saved from no changes, and clears on edits and version changes in %s', async (locale, savedText, unchangedText, parameterName, minimum, olderVersion) => {
  await start(locale); await openRecipe('R01');
  await edit(field(parameterName, 'Setpoint'), '180');
  const status = (text: string) => [...one(ids.version).querySelectorAll('[role="status"]')].find(element => element.textContent === text);
  await click(one(ids.save));
  const saved = status(savedText);
  expect(saved?.getAttribute('aria-live')).toBe('polite');
  expect(status(unchangedText)).toBeUndefined();
  await edit(field(parameterName, 'Setpoint'), '181');
  expect(status(savedText)).toBeUndefined();
  await click(one(ids.save));
  expect(status(savedText)).not.toBe(saved);
  expect(saved?.isConnected).toBe(false);
  await click(one(ids.save));
  const unchanged = status(unchangedText);
  expect(unchanged?.getAttribute('aria-live')).toBe('polite');
  expect(status(savedText)).toBeUndefined();
  await click(one(ids.save));
  expect(status(unchangedText)).not.toBe(unchanged);
  expect(unchanged?.isConnected).toBe(false);
  await edit(field(parameterName, minimum), '999');
  expect(status(unchangedText)).toBeUndefined();
  await click(one(ids.save));
  expect(status(unchangedText)).toBeDefined();
  await click(button(locale === 'en' ? 'Remove step' : 'Remover etapa', steps()[3]!));
  expect(status(unchangedText)).toBeUndefined();
  await click(one(ids.save));
  expect(status(savedText)?.textContent).toBe(savedText);
  await pick(ids.versionChoice, olderVersion);
  expect(status(savedText)).toBeUndefined();
  await pick(ids.versionChoice, `R01 v3 · ${t(locale, 'recipe-status.draft')}`);
  expect(status(unchangedText)).toBeUndefined();
});

it('confirms Discard in an Ant Modal, restores focus on cancel and returns to search after deleting the Draft', async () => {
  await start(); await openRecipe('R01');
  await act(() => one(ids.discard).focus()); await click(one(ids.discard));
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain('Discard this Draft and its working changes?');
  await act(() => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: '6', bubbles: true })); });
  expect(location.hash).toBe('#/recipes');
  await click(button('Cancel', dialog)); await endMotion();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(one(ids.discard));
  await click(one(ids.discard));
  await click(button('Discard draft', document.querySelector('[role="dialog"]')!)); await endMotion();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(byId(ids.version)).toHaveLength(0);
  expect(document.activeElement).toBe(one(ids.search));
  expect(plantState().events.at(-1)).toMatchObject({ action: 'recipe-discard', target: 'R01-v3' });
  expect(rows()[0]!.querySelectorAll('td')[4]!.textContent).toBe('2');
  expect(rows()[0]!.querySelectorAll('td')[5]!.textContent).toBe('Approved');
});

it('sends focus to the search after confirming Discard while the filters leave no Recipe to show', async () => {
  await start(); await openRecipe('R01');
  await input(one(ids.search), 'missing');
  expect(byId(ids.version)).toHaveLength(1);
  await click(one(ids.discard));
  await click(button('Discard draft', document.querySelector('[role="dialog"]')!)); await endMotion();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(one(ids.search));
});

it('checks die pressure at screw speed, weld temperature and time, and the strict 120 second takt using literal edits', async () => {
  await start(); await openRecipe('R06');
  await edit(field('Die pressure', 'Setpoint'), '200');
  expect(one(ids.rule2).textContent).toBe('Die pressure limitPassing');
  await edit(field('Screw speed', 'Setpoint'), '10');
  expect(one(ids.rule2).textContent).toContain('Die pressure and Screw speed: 200.0 bar violates the maximum rule limit of 190.0 bar.');
  await edit(field('Screw speed', 'Setpoint'), '22');
  expect(one(ids.rule2).textContent).toBe('Die pressure limitPassing');
  await openRecipe('R05');
  await edit(field('Weld temperature', 'Setpoint'), '255');
  expect(one(ids.rule3).textContent).toBe('Weld windowPassing');
  await edit(field('Weld temperature', 'Setpoint'), '275');
  expect(one(ids.rule3).textContent).toContain('Weld temperature: 275.0 °C violates the maximum rule limit of 270.0 °C.');
  await edit(field('Weld temperature', 'Setpoint'), '255');
  await edit(field('Weld time', 'Minimum'), '19'); await edit(field('Weld time', 'Setpoint'), '19');
  expect(one(ids.rule3).textContent).toContain('Weld time: 19 s is below the minimum of 20 s.');
  await edit(field('Weld time', 'Setpoint'), '30');
  expect(one(ids.rule3).textContent).toBe('Weld windowPassing');
  await edit(field('Weld time', 'Maximum'), '41'); await edit(field('Weld time', 'Setpoint'), '41');
  expect(one(ids.rule3).textContent).toContain('Weld time: 41 s violates the maximum rule limit of 40 s.');
  await edit(field('Weld time', 'Setpoint'), '30');
  expect(one(ids.rule3).textContent).toBe('Weld windowPassing');
  await openRecipe('R10'); await edit(field('Cycle time', 'Setpoint'), '119');
  expect(one(ids.rule4).textContent).toBe('Takt limitPassing');
  await edit(field('Cycle time', 'Setpoint'), '120');
  expect(one(ids.rule4).textContent).toContain('Cycle time: 120 s violates the maximum rule limit of 120 s.');
  await click(one(ids.save));
  expect(description(one(ids.save))).toBe('Resolve the failing dependency rules before continuing. Takt limit');
  await edit(field('Cycle time', 'Setpoint'), '119');
  expect(one(ids.rule4).textContent).toBe('Takt limitPassing');
  await openRecipe('R02');
  for (const id of [ids.rule1, ids.rule2, ids.rule3, ids.rule4]) expect(one(id).textContent).toContain('Not applicable');
});

it.each([['en', '2.5'], ['pt-BR', '2,5']] as const)('edits decimal Parameters without changing magnitude in %s', async (locale, typed) => {
  await start(locale); await openRecipe('R11'); await click(one(ids.newDraft));
  const target = field(locale === 'en' ? 'Puller speed' : 'Velocidade do puxador', 'Setpoint');
  await type(target, typed);
  expect(target.value).toBe(typed);
  await act(() => target.blur());
  expect(plantState().recipeVersions.find(version => version.id === 'R11-v3')?.steps[2]?.parameters[7]?.setpoint).toBe(2.5);
  expect(target.value).toBe(typed);
  expect(document.body.textContent).not.toContain('[[');
});

it('keeps the dependency status stable across clock ticks and announces each rule status change only in its summary', async () => {
  vi.useFakeTimers(); let clock = 0;
  app = await mountApp('#/recipes', { dataset, search: '', now: () => clock });
  await openRecipe('R01');
  const summary = document.querySelector('[role="status"][aria-live="polite"]')!;
  expect(summary.textContent).toContain('Barrel temperature window: Failing.');
  const before = summary.textContent;
  clock = 2000; await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
  expect(document.querySelector('[role="status"][aria-live="polite"]')).toBe(summary);
  expect(summary.textContent).toBe(before);
  await edit(field('Barrel zone 3', 'Setpoint'), '180');
  expect(summary.textContent).toContain('Barrel temperature window: Passing.');
  expect(document.querySelectorAll('[aria-live="assertive"]')).toHaveLength(0);
  expect(document.querySelectorAll('[role="status"][aria-live="polite"]')).toHaveLength(1);
  clock = 3000; await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
  expect(document.querySelector('[role="status"][aria-live="polite"]')).toBe(summary);
  expect(summary.textContent).toContain('Barrel temperature window: Passing.');
});

it('opens a focused library row with Enter and keeps the full labels available to keyboard users', async () => {
  await start();
  const row = rows().find(row => row.querySelector('td')?.textContent === 'R04') as HTMLElement;
  expect(row.tabIndex).toBe(0);
  await act(() => { row.focus(); row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  expect(one(ids.version).textContent).toContain('R04 v3');
  expect(document.activeElement?.textContent).toBe('Recipe Version details');
  for (const label of ['Minimum', 'Setpoint', 'Maximum']) {
    const target = field('Tool offset', label);
    expect(target.getAttribute('aria-label')).toBe(`Tool offset, ${label}`);
    expect(description(target)).toBe('Approved version. Create a new Draft to edit.');
  }
});

it.each(['en', 'pt-BR'] as const)('renders every manifest key as exact text or an accessible attribute in %s', async locale => {
  const keys = new Set<MessageKey>([...Object.values(recipesCoverage.shows), ...Object.values(recipesCoverage.actions), ...Object.values(recipesCoverage.states)].flat());
  const seen = new Set<MessageKey>();
  const capture = () => {
    const rendered = [...document.querySelectorAll('*')].flatMap(element => [
      ...(![...element.children].some(child => child.textContent === element.textContent) ? [element.textContent ?? ''] : []),
      ...['aria-label', 'placeholder', 'title'].map(attribute => element.getAttribute(attribute) ?? ''),
    ]);
    const decimal = (value: string) => locale === 'en' ? value : value.replace('.', ',');
    const variants: Partial<Record<MessageKey, Record<string, string | number>[]>> = {
      'recipes.step-number': [{ number: 1 }],
      'recipes.blocked-reason': [{ reason: t(locale, 'plant-error.rules-failing'), rules: t(locale, 'dependency-rule.barrel-temperature-window') }],
      'recipes.rule-status-line': [{ rule: t(locale, 'dependency-rule.barrel-temperature-window'), status: t(locale, 'rule-status.fail') }],
      'recipes.recipe-label': [{ id: 'R01', name: t(locale, 'recipe.extrusion', { product: 'WIN-1L-60' }) }],
      'recipes.open-version-of': [{ recipe: `R01, ${t(locale, 'recipe.extrusion', { product: 'WIN-1L-60' })}` }],
      'recipes.parameter-field': [{ parameter: t(locale, 'parameter.barrel-zone-3'), field: t(locale, 'common.minimum') }],
      'recipes.version-option': [{ recipe: 'R01', number: 3, status: t(locale, 'recipe-status.draft') }], 'common.row-count.other': [{ count: 40 }],
      'recipes.violation.above-max': [{ parameter: t(locale, 'parameter.barrel-zone-3'), actual: decimal('198.0'), limit: decimal('195.0'), unit: '°C' }],
      'recipes.violation.adjacent-too-far': [{ parameter: locale === 'en' ? 'Barrel zone 2 and Barrel zone 3' : 'Zona 2 do cilindro e Zona 3 do cilindro', actual: decimal('22.0'), limit: decimal('15.0'), unit: '°C' }],
      'recipes.violation.below-min': [{ parameter: t(locale, 'parameter.barrel-zone-3'), actual: decimal('164.0'), limit: decimal('165.0'), unit: '°C' }],
      'recipes.violation.missing': [{ parameter: t(locale, 'parameter.barrel-zone-1'), actual: t(locale, 'common.unknown'), limit: decimal('0.0'), unit: '°C' }],
    };
    for (const key of keys) if ((variants[key] ?? [{}]).some(params => rendered.includes(t(locale, key, params)))) seen.add(key);
  };
  const localField = (key: MessageKey, label: MessageKey) => field(t(locale, key), t(locale, label));
  await start(locale); capture();
  await openSelect(ids.filterLineType); capture();
  await pick(ids.filterLineType, t(locale, 'line-type.extrusion')); capture();
  await openSelect(ids.filterStatus); capture();
  await pick(ids.filterStatus, t(locale, 'recipe-status.draft')); capture();
  await openRecipe('R01'); capture();
  await input(one(ids.search), 'missing'); capture();
  await input(one(ids.search), '');
  await edit(localField('parameter.barrel-zone-3', 'term.setpoint'), '180'); capture();
  await click(one(ids.save)); capture();
  await click(one(ids.save)); capture();
  await edit(localField('parameter.barrel-zone-3', 'common.minimum'), '190'); capture();
  await edit(localField('parameter.barrel-zone-3', 'common.minimum'), '160');
  await edit(localField('parameter.barrel-zone-3', 'term.setpoint'), '164'); capture();
  await edit(localField('parameter.barrel-zone-3', 'term.setpoint'), '180');
  await click(one(ids.discard)); capture();
  await click(button(t(locale, 'action.cancel'), document.querySelector('[role="dialog"]')!)); await endMotion();
  await pick(ids.versionChoice, `R01 v2 · ${t(locale, 'recipe-status.approved')}`); capture();
  await pick(ids.versionChoice, `R01 v3 · ${t(locale, 'recipe-status.draft')}`);
  for (let index = 0; index < 4; index++) { await click(button(t(locale, 'action.remove-step'), steps()[0]!)); capture(); }
  await app!.unmount(); app = undefined;
  // Empty Parameters are a valid incomplete working copy at the core boundary.
  const incomplete = { ...dataset, recipeVersions: dataset.recipeVersions.map(version => version.id === 'R01-v3'
    ? { ...version, steps: version.steps.map(step => step.kind === 'preheat' ? { ...step, parameters: [] } : step) } : version) };
  await start(locale, incomplete); await openRecipe('R01'); capture();
  await input(one(ids.search), 'missing'); capture();
  await app!.unmount(); app = undefined;
  await start(locale); await input(one(ids.search), 'missing'); capture();
  expect(byId(ids.empty)).toHaveLength(1); expect(byId(ids.libraryEmpty)).toHaveLength(0);
  expect([...keys].filter(key => !seen.has(key))).toEqual([]);
}, 30_000);

it('keeps the library and every Step in single semantic tables with their own headers', async () => {
  await start();
  expect(one(ids.library).querySelectorAll('table')).toHaveLength(1);
  const headerText = [...one(ids.library).querySelectorAll('thead th')].map(cell => cell.textContent);
  expect(headerText).toEqual(['Recipe ID', 'Recipe name', 'Product', 'Line type', 'Latest version', 'Recipe status', 'Open Recipe Version']);
  await openRecipe('R01');
  for (const step of steps()) {
    expect(step.querySelectorAll('table')).toHaveLength(1);
    expect([...step.querySelectorAll('thead th')].map(cell => cell.textContent)).toEqual(['Parameter', 'Minimum', 'Setpoint', 'Maximum', 'Unit']);
  }
});

it('offers a Step kind choice only when core has an addable Step, while unavailable actions explain the reason', async () => {
  await start(); await openRecipe('R11');
  expect(byId(ids.stepChoice)).toHaveLength(0);
  expect(description(one(ids.addStep))).toBe('Approved version. Create a new Draft to edit.');
  await click(one(ids.newDraft));
  expect(byId(ids.stepChoice)).toHaveLength(0);
  expect(description(one(ids.addStep))).toBe('Remove a Step to add it again from the Approved template.');
  await click(button('Remove step', steps()[1]!));
  expect(byId(ids.stepChoice)).toHaveLength(1);
  await openSelect(ids.stepChoice);
  expect([...document.querySelectorAll('[role="option"]')].map(element => element.textContent)).toEqual(['Ramp']);
});

it.each(['en', 'pt-BR'] as const)('names no stepper arrow icon of the Parameter fields in %s', async locale => {
  await start(locale); await openRecipe('R01');
  expect(byId(ids.parameter).length).toBeGreaterThan(0);
  expect([...document.querySelectorAll('[role="img"]:not([aria-hidden="true"])')].map(el => el.getAttribute('aria-label')).filter(name => name === 'up' || name === 'down')).toEqual([]);
});

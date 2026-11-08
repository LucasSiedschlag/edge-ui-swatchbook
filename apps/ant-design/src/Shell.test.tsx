// @vitest-environment happy-dom
import { SCREENS, TEST_IDS, shellNavId, t, PREFERENCES_KEY, ptBR, en } from '@swatchbook/core';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { byId, choose, click, memoryStorage, mountApp, one, options, openSelect, pickOption } from './test-utils';

let view: Awaited<ReturnType<typeof mountApp>> | undefined;
beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });
afterEach(async () => { await view?.unmount(); view = undefined; history.replaceState(null, '', '/'); });
/** All CSS Ant Design has injected, so a token change shows up here. */
const antStyles = () => [...document.querySelectorAll('style')].map(el => el.textContent).join('\n');
const root = () => document.querySelector<HTMLElement>('[data-app-root]')!;

it('renders the six navigation items and follows the route', async () => {
  view = await mountApp('#/deck');
  for (const screen of SCREENS) expect(byId(shellNavId(screen.id))).toHaveLength(1);
  expect(one(shellNavId('deck')).textContent).toContain(en['screen.deck']);
  await click(one(shellNavId('ledger')));
  expect(location.hash).toBe('#/ledger');
  expect(one(shellNavId('ledger')).className).toContain('selected');
});

it('switches the language, the visible text and the document language', async () => {
  view = await mountApp('#/deck');
  expect(document.documentElement.lang).toBe('en');
  await choose(TEST_IDS.shell.language, en['language.portuguese']);
  expect(document.documentElement.lang).toBe('pt-BR');
  expect(one(shellNavId('deck')).textContent).toContain(ptBR['screen.deck']);
  expect(document.body.textContent).not.toContain('[[');
});

it('toggles theme and density on the ConfigProvider and persists them', async () => {
  view = await mountApp('#/deck', { storage: window.localStorage });
  expect(root().dataset.theme).toBe('light');
  expect(root().dataset.density).toBe('comfortable');
  const lightStyles = antStyles();
  await choose(TEST_IDS.shell.theme, en['theme.dark']);
  await choose(TEST_IDS.shell.density, en['density.compact']);
  expect(root().dataset.theme).toBe('dark');
  expect(root().dataset.density).toBe('compact');
  // The Ant Design algorithms, not only the attributes the app sets: dark and compact change the rendered CSS.
  expect(antStyles()).not.toBe(lightStyles);
  expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!)).toMatchObject({ theme: 'dark', density: 'compact' });
});

it('applies presets to both theme and density', async () => {
  view = await mountApp('#/deck', { storage: window.localStorage });
  await pickOption(TEST_IDS.shell.preset, t('en', 'preset.control-room'));
  expect([root().dataset.theme, root().dataset.density]).toEqual(['dark', 'compact']);
  await pickOption(TEST_IDS.shell.preset, t('en', 'preset.night'));
  expect([root().dataset.theme, root().dataset.density]).toEqual(['dark', 'comfortable']);
  await pickOption(TEST_IDS.shell.preset, t('en', 'preset.office'));
  expect([root().dataset.theme, root().dataset.density]).toEqual(['light', 'comfortable']);
  expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!)).toMatchObject({ theme: 'light', density: 'comfortable' });
});

it('reads stored preferences at start', async () => {
  const storage = memoryStorage({ [PREFERENCES_KEY]: JSON.stringify({ language: 'pt-BR', theme: 'dark', density: 'compact' }) });
  view = await mountApp('#/deck', { storage });
  expect([document.documentElement.lang, root().dataset.theme, root().dataset.density]).toEqual(['pt-BR', 'dark', 'compact']);
});

it('shows Libraries that are not built disabled and cannot choose them', async () => {
  view = await mountApp('#/deck');
  await openSelect(TEST_IDS.shell.libraryPicker);
  const all = options();
  expect(all).toHaveLength(3);
  const disabled = all.filter(o => o.getAttribute('aria-disabled') === 'true');
  expect(disabled).toHaveLength(2);
  for (const option of disabled) expect(option.textContent).toContain(en['shell.library-not-built']);
  const before = location.href;
  await click(disabled[0]!);
  expect(location.href).toBe(before);
});

it('runs the Tour from the route', async () => {
  view = await mountApp('#/control');
  expect(byId(TEST_IDS.shell.tour)).toHaveLength(0);
  await click(one(TEST_IDS.shell.tourStart));
  expect(location.hash.startsWith('#/deck')).toBe(true);
  const tour = one(TEST_IDS.shell.tour);
  expect(tour.textContent).toContain(en['screen.deck']);
  expect(tour.textContent).toContain(en['tour.deck.note']);
  expect(tour.textContent).toContain('Step 1 of 6');
  expect((one(TEST_IDS.shell.tourPrevious) as HTMLButtonElement).disabled).toBe(true);
  await click(one(TEST_IDS.shell.tourNext));
  expect(location.hash.startsWith('#/recipes')).toBe(true);
  expect(one(TEST_IDS.shell.tour).textContent).toContain('Step 2 of 6');
  await click(one(TEST_IDS.shell.tourPrevious));
  expect(location.hash.startsWith('#/deck')).toBe(true);
  // The route is the single source: leaving by navigation moves the step.
  await click(one(shellNavId('ledger')));
  expect(one(TEST_IDS.shell.tour).textContent).toContain('Step 3 of 6');
  await click(one(TEST_IDS.shell.tourFinish));
  expect(byId(TEST_IDS.shell.tour)).toHaveLength(0);
  expect(location.hash.startsWith('#/ledger')).toBe(true);
});

it('shows a translated placeholder for Screens that are not built', async () => {
  view = await mountApp('#/ledger');
  const placeholder = one('ledger.placeholder');
  expect(placeholder.textContent).toContain(en['screen.ledger']);
  await choose(TEST_IDS.shell.language, en['language.portuguese']);
  expect(one('ledger.placeholder').textContent).toContain(ptBR['screen.ledger']);
});

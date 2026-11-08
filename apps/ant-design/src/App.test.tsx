// @vitest-environment happy-dom
import { SCREENS, TEST_IDS, shellNavId } from '@swatchbook/core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppRoot } from './AppRoot';
import { byId, memoryStorage, mount } from './test-utils';

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { history.replaceState(null, '', '/'); vi.restoreAllMocks(); });

it.each(SCREENS.map(screen => screen.route))('mounts AppRoot at %s without errors', async route => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
  history.replaceState(null, '', `/#${route}`);
  const view = await mount(<AppRoot search="?tick=0" languages={['pt-BR']} storage={memoryStorage()} now={() => 0} />);
  try {
    const id = route.slice(1);
    expect(byId(shellNavId(id as (typeof SCREENS)[number]['id']))).toHaveLength(1);
    expect(byId(TEST_IDS.shell.libraryPicker)).toHaveLength(1);
    expect(document.body.textContent).not.toContain('[[');
    expect(byId(id === 'deck' ? TEST_IDS.deck.lineStatus : `${id}.placeholder`)).toHaveLength(1);
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  } finally {
    await view.unmount();
  }
});

it('sends an invalid hash to the Deck', async () => {
  history.replaceState(null, '', '/#/nowhere');
  const view = await mount(<AppRoot search="?tick=0" storage={memoryStorage()} now={() => 0} />);
  expect(location.hash).toBe('#/deck');
  await view.unmount();
});

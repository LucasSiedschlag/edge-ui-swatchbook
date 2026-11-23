// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { TEST_IDS } from '@swatchbook/core';
import { click, mountApp, one } from './test-utils';

let view: Awaited<ReturnType<typeof mountApp>> | undefined;
beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });
afterEach(async () => { await view?.unmount(); view = undefined; history.replaceState(null, '', '/'); });

const exposedNames = () => [...document.querySelectorAll<HTMLElement>('[role="img"]:not([aria-hidden="true"])')].map(el => el.getAttribute('aria-label'));

it.each(['en', 'pt-BR'] as const)('exposes no decorative arrow icon name on any Screen in %s', async locale => {
  for (const route of ['deck', 'control', 'parameters', 'performance', 'ledger', 'recipes']) {
    view = await mountApp(`#/${route}`, { languages: [locale] });
    expect(document.querySelectorAll('.ant-select').length, route).toBeGreaterThan(0);
    expect(exposedNames().filter(name => name === 'down' || name === 'up'), `${route} ${locale}`).toEqual([]);
    await view.unmount();
    view = undefined;
  }
});

// happy-dom computes no accessibility tree, so this reads the role=img nodes that lack aria-hidden. Chromium's tree was read through CDP (docs/libraries/ant-design.md).
it.each(['en', 'pt-BR'] as const)('exposes no close icon name on the Drawer and Modal close buttons in %s', async locale => {
  const steps: [string, () => unknown, string][] = [
    ['#/ledger', () => click(document.querySelector<HTMLElement>('[role="row"] button')!), '.ant-drawer-close'],
    ['#/recipes', async () => { await click(document.querySelector<HTMLElement>('tbody button')!); await click(one(TEST_IDS.recipes.discard)); }, '.ant-modal-close'],
    ['#/deck', () => click(one(TEST_IDS.deck.estop)), '.ant-modal-close'],
  ];
  for (const [route, open, close] of steps) {
    view = await mountApp(route, { languages: [locale] });
    await open();
    expect(document.querySelectorAll(close).length, route).toBeGreaterThan(0);
    expect(exposedNames().filter(name => name === 'close'), `${route} ${locale}`).toEqual([]);
    await view.unmount();
    view = undefined;
  }
});

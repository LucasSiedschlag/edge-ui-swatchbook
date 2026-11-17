// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { mountApp } from './test-utils';

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

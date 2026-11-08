// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { LIBRARIES, LIBRARY_NOT_BUILT_KEY, libraryUrl } from './registry';
import { parseHash, screenHash, useRoute } from './route';
import { mount } from './testing';
import { RuntimeProvider } from './plant';

afterEach(() => { vi.restoreAllMocks(); history.replaceState(null, '', '/'); });

it('lists the three v1 Libraries and preserves the Screen in a normalized URL', () => {
  expect(LIBRARIES).toEqual([
    { id: 'ant-design', name: 'Ant Design', status: 'built' },
    { id: 'ui5', name: 'UI5 Web Components for React', status: 'planned' },
    { id: 'ix', name: 'Siemens iX', status: 'planned' },
  ]);
  expect(LIBRARY_NOT_BUILT_KEY).toBe('shell.library-not-built');
  for (const siteBase of ['/edge-ui-swatchbook', '/edge-ui-swatchbook/', '/edge-ui-swatchbook///']) {
    expect(libraryUrl({ siteBase, libraryId: 'ui5', screen: 'ledger' })).toBe('/edge-ui-swatchbook/ui5/#/ledger');
  }
  expect(libraryUrl({ siteBase: '', libraryId: 'ant-design', screen: 'deck' })).toBe('/ant-design/#/deck');
});

it.each(['#/deck', '#deck', '/deck', '#/deck?tick=4'])('parses %s', hash => {
  expect(parseHash(hash)).toBe('deck');
});
it.each(['', '#/', '#/unknown', '#/deck/extra', '#/Deck', 'deck', '##/deck'])('rejects %s', hash => {
  expect(parseHash(hash)).toBeNull();
});
it('makes canonical hashes', () => expect(screenHash('parameters')).toBe('#/parameters'));

it.each(['', '#/bad'])('replaces invalid initial hash %s and follows navigation', async hash => {
  history.replaceState(null, '', `/${hash}`);
  const replace = vi.spyOn(history, 'replaceState');
  const length = history.length;
  let route!: ReturnType<typeof useRoute>;
  function Probe() { route = useRoute(); return null; }
  const view = await mount(<Probe />, true);
  try {
    expect(route.screen).toBe('deck');
    expect(location.hash).toBe('#/deck');
    expect(history.length).toBe(length);
    expect(replace).toHaveBeenCalledWith(null, '', '#/deck');
    await act(() => route.go('recipes'));
    expect(route.screen).toBe('recipes');
    expect(location.hash).toBe('#/recipes');
    await act(() => { history.replaceState(null, '', '#control'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(route.screen).toBe('control');
    await act(() => { history.replaceState(null, '', '#/bad'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(route.screen).toBe('deck');
    expect(location.hash).toBe('#/deck');
  } finally { await view.unmount(); }
});

it('does not overwrite navigation from a child effect while normalizing an empty hash', async () => {
  let screen = '';
  function Probe() {
    const route = useRoute();
    screen = route.screen;
    useEffect(() => route.go('control'), [route.go]);
    return null;
  }
  const view = await mount(<RuntimeProvider libraryId="ant-design" supportsDensity search="?tick=0"><Probe /></RuntimeProvider>, true);
  try {
    expect(screen).toBe('control');
    expect(location.hash).toBe('#/control');
  } finally { await view.unmount(); }
});

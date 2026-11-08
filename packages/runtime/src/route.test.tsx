// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { LIBRARIES, LIBRARY_NOT_BUILT_KEY, libraryUrl, siteBaseFrom, useLibrary } from './registry';
import { parseHash, screenHash, useRoute } from './route';
import { mount } from './testing';
import { usePreferences } from './preferences';
import { useSimulation } from './plant';
import { RuntimeProvider } from './plant';

afterEach(() => { vi.restoreAllMocks(); history.replaceState(null, '', '/'); });

it('lists the three v1 Libraries and preserves the Screen in a normalized URL', () => {
  expect(LIBRARIES).toEqual([
    { id: 'ant-design', name: 'Ant Design', status: 'built', supportsDensity: true },
    { id: 'ui5', name: 'UI5 Web Components for React', status: 'planned', supportsDensity: false },
    { id: 'ix', name: 'Siemens iX', status: 'planned', supportsDensity: false },
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
  const view = await mount(<RuntimeProvider libraryId="ant-design" search="?tick=0"><Probe /></RuntimeProvider>, true);
  try {
    expect(screen).toBe('control');
    expect(location.hash).toBe('#/control');
  } finally { await view.unmount(); }
});


it.each(LIBRARIES)('uses $id registry capabilities without a separate provider prop', async library => {
  let entry!: ReturnType<typeof useLibrary>, prefs!: ReturnType<typeof usePreferences>;
  function Probe() { entry = useLibrary(); prefs = usePreferences(); return null; }
  const view = await mount(<RuntimeProvider libraryId={library.id} search="?tick=0"><Probe /></RuntimeProvider>, true);
  try {
    expect(entry).toBe(library);
    expect(prefs.supportsDensity).toBe(library.supportsDensity);
    expect(prefs.densityUnavailable).toBe(!library.supportsDensity);
  } finally { await view.unmount(); }
});

it('allows an explicit density capability override for tests', async () => {
  let prefs!: ReturnType<typeof usePreferences>;
  function Probe() { prefs = usePreferences(); return null; }
  const view = await mount(<RuntimeProvider libraryId="ix" supportsDensityOverride search="?tick=0"><Probe /></RuntimeProvider>);
  try { expect(prefs.supportsDensity).toBe(true); } finally { await view.unmount(); }
});

it.each([
  ['/edge-ui-swatchbook/ant-design/', '/edge-ui-swatchbook'],
  ['/edge-ui-swatchbook/ant-design///', '/edge-ui-swatchbook'],
  ['/ant-design/', ''], ['ant-design/', ''], ['/', ''], ['', ''],
  ['/edge-ui-swatchbook/', '/edge-ui-swatchbook'],
  ['/other-ant-design/', '/other-ant-design'],
  ['/ant-design/nested/', '/ant-design/nested'],
  ['https://example.com/site/ant-design/', 'https://example.com/site'],
])('derives the site base from Vite base %s', (base, expected) => {
  expect(siteBaseFrom(base, 'ant-design')).toBe(expected);
});

it.each([
  ['?tick=7', '#/deck', '?tick=7'], ['', '#/deck?tick=4', '?tick=4'],
  ['?tick=0', '#/deck?tick=4', '?tick=0'], ['?tick=bad', '#/deck?tick=4', ''],
  ['?tick=-2', '#/deck', ''], ['', '#/deck', ''],
])('keeps only the frozen tick when switching Library (%s, %s)', (search, hash, expected) => {
  history.replaceState(null, '', `/site/ant-design/${search}${hash}`);
  expect(libraryUrl({ siteBase: siteBaseFrom('/site/ant-design/', 'ant-design'), libraryId: 'ui5', screen: 'ledger' }))
    .toBe(`/site/ui5/${expected}#/ledger`);
});

it('keeps a hash-only frozen tick through navigation and the Library switcher', async () => {
  history.replaceState(null, '', '/ant-design/#/deck?tick=4');
  let route!: ReturnType<typeof useRoute>, tick = -1;
  function Probe() { route = useRoute(); tick = useSimulation().tick; return null; }
  const view = await mount(<RuntimeProvider libraryId="ant-design"><Probe /></RuntimeProvider>, true);
  try {
    expect(tick).toBe(4);
    await act(() => route.go('ledger'));
    expect(tick).toBe(4);
    expect(libraryUrl({ siteBase: '', libraryId: 'ui5', screen: route.screen })).toBe('/ui5/?tick=4#/ledger');
  } finally { await view.unmount(); }
});

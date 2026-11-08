// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { SCREENS } from '@swatchbook/core';
import { RuntimeProvider } from './plant';
import { keyboardEventLike, topShortcutHandler, useShortcut, useShortcutHandlers } from './shortcuts';
import { useRoute } from './route';
import { mount } from './testing';

afterEach(() => { vi.restoreAllMocks(); history.replaceState(null, '', '/'); });
async function key(key: string, target: EventTarget = document, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
  await act(() => { target.dispatchEvent(event); });
  return event;
}

it.each([false, true])('gives a child priority in one commit and after route remount, with fallthrough (decline=%s)', async decline => {
  const parent = vi.fn(), child = vi.fn(() => decline ? false : undefined);
  let route!: ReturnType<typeof useRoute>;
  function Child() { useShortcut('acknowledge', child); return null; }
  function Parent() { useShortcut('acknowledge', parent); return <Child />; }
  function Screens() { route = useRoute(); return route.screen === 'deck' ? <Parent /> : null; }
  const view = await mount(<RuntimeProvider libraryId="ant-design" search="?tick=0"><Screens /></RuntimeProvider>, true);
  try {
    for (let visit = 1; visit <= 2; visit++) {
      expect((await key('a')).defaultPrevented).toBe(true);
      expect(child).toHaveBeenCalledTimes(visit);
      expect(parent).toHaveBeenCalledTimes(decline ? visit : 0);
      await act(() => route.go('recipes'));
      expect((await key('a')).defaultPrevented).toBe(false);
      await act(() => route.go('deck'));
    }
  } finally { await view.unmount(); }
});

it('selects the top registered handler for each action', () => {
  const first = vi.fn(), second = vi.fn();
  expect(topShortcutHandler([{ 'focus-search': first }, { acknowledge: second }], 'focus-search')).toBe(first);
  expect(topShortcutHandler([{ 'focus-search': first }, { 'focus-search': second }], 'focus-search')).toBe(second);
  expect(topShortcutHandler([], 'focus-search')).toBeUndefined();
});

it('handles acknowledge, filters text inputs and native Enter, and owns Screen shortcuts', async () => {
  const acknowledge = vi.fn(), open = vi.fn();
  let screen = '';
  function Probe() {
    useShortcutHandlers({ acknowledge, 'open-details': open });
    screen = useRoute().screen;
    return <><input /><button>Native</button><div role="row" tabIndex={0} /></>;
  }
  const view = await mount(<RuntimeProvider libraryId="ant-design" search="?tick=0"><Probe /></RuntimeProvider>, true);
  try {
    expect((await key('a')).defaultPrevented).toBe(true);
    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect((await key('a', view.container.querySelector('input')!)).defaultPrevented).toBe(false);
    expect((await key('a', document, { isComposing: true })).defaultPrevented).toBe(false);
    expect((await key('a', document, { keyCode: 229 })).defaultPrevented).toBe(false);
    expect((await key('a', document, { ctrlKey: true })).defaultPrevented).toBe(false);
    expect((await key('a', document, { repeat: true })).defaultPrevented).toBe(false);
    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect((await key('Enter', view.container.querySelector('button')!)).defaultPrevented).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect((await key('Enter', view.container.querySelector('[role="row"]')!)).defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    for (const [i, expected] of SCREENS.entries()) {
      expect((await key(String(i + 1))).defaultPrevented).toBe(true);
      expect(screen).toBe(expected.id);
      expect(location.hash).toBe(`#/${expected.id}`);
    }
  } finally { await view.unmount(); }
  expect((await key('a')).defaultPrevented).toBe(false);
});

it('keeps the latest mounted search handler on re-render and falls back on unmount', async () => {
  const first = vi.fn(), updated = vi.fn(), drawer = vi.fn();
  function Screen({ changed }: { changed: boolean }) { useShortcut('focus-search', changed ? updated : first); return null; }
  function Drawer() { useShortcut('focus-search', drawer); return null; }
  const tree = (show: boolean, changed = false) => <RuntimeProvider libraryId="ant-design" search="?tick=0"><Screen changed={changed} />{show && <Drawer />}</RuntimeProvider>;
  const view = await mount(tree(false), true);
  try {
    await key('/');
    expect(first).toHaveBeenCalledTimes(1);
    await view.render(tree(true));
    await key('/');
    expect(drawer).toHaveBeenCalledTimes(1);
    await view.render(tree(true, true));
    await key('/');
    expect(drawer).toHaveBeenCalledTimes(2);
    expect(updated).not.toHaveBeenCalled();
    await view.render(tree(false, true));
    await key('/');
    expect(updated).toHaveBeenCalledTimes(1);
    await view.render(<RuntimeProvider libraryId="ant-design" search="?tick=0" />);
    expect((await key('/')).defaultPrevented).toBe(false);
  } finally { await view.unmount(); }
});

it('only prevents default when handled and accepts an optional row focus predicate', async () => {
  const search = vi.fn(() => false), open = vi.fn();
  function Probe() { useShortcutHandlers({ 'focus-search': search, 'open-details': open }); return <div data-row="yes" />; }
  const view = await mount(<RuntimeProvider libraryId="ant-design" search="?tick=0" rowFocused={event => (event.target as HTMLElement)?.dataset?.row === 'yes'}><Probe /></RuntimeProvider>);
  try {
    expect((await key('/')).defaultPrevented).toBe(false);
    expect(search).toHaveBeenCalledTimes(1);
    expect((await key('Enter', view.container.querySelector('div')!)).defaultPrevented).toBe(true);
    const event = new KeyboardEvent('keydown', { key: '/', cancelable: true });
    event.preventDefault();
    await act(() => { document.dispatchEvent(event); });
    expect(search).toHaveBeenCalledTimes(1);
  } finally { await view.unmount(); }
});

it('forwards composed paths and modifier state from real keyboard events', async () => {
  const acknowledge = vi.fn();
  function Probe() { useShortcut('acknowledge', acknowledge); return <div />; }
  const view = await mount(<RuntimeProvider libraryId="ant-design" search="?tick=0"><Probe /></RuntimeProvider>);
  try {
    const host = view.container.querySelector('div')!;
    const input = document.createElement('input');
    host.attachShadow({ mode: 'open' }).append(input);
    expect((await key('a', input, { composed: true })).defaultPrevented).toBe(false);
    expect(acknowledge).not.toHaveBeenCalled();
    const event = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, altKey: true, shiftKey: true });
    const modifier = vi.spyOn(event, 'getModifierState').mockImplementation(name => name === 'AltGraph');
    const adapted = keyboardEventLike(event);
    expect(adapted.getModifierState?.('AltGraph')).toBe(true);
    expect(modifier).toHaveBeenCalledWith('AltGraph');
    expect(adapted).toMatchObject({ key: 'a', ctrlKey: true, altKey: true, shiftKey: true, defaultPrevented: false, isComposing: false, keyCode: 0 });
  } finally { await view.unmount(); }
});


it('leaves every Escape to the Library, including unsupported legacy close registrations', async () => {
  const handler = vi.fn(), rowFocused = vi.fn(() => true);
  function Probe() {
    // @ts-expect-error Library components own close; it is not a runtime action.
    useShortcut('close', handler);
    // @ts-expect-error Handler maps also exclude close.
    useShortcutHandlers({ close: handler });
    useShortcutHandlers({ acknowledge: handler, 'focus-search': handler, 'open-details': handler });
    return <><input /><button /><div role="dialog"><span /></div></>;
  }
  const view = await mount(<RuntimeProvider libraryId="ant-design" search="?tick=0" rowFocused={rowFocused}><Probe /></RuntimeProvider>, true);
  try {
    for (const target of [document, ...view.container.querySelectorAll('*')]) {
      expect((await key('Escape', target)).defaultPrevented).toBe(false);
    }
    expect(handler).not.toHaveBeenCalled();
    expect(rowFocused).not.toHaveBeenCalled();
  } finally { await view.unmount(); }
});

it('blocks runtime shortcuts from descendants of dialogs, including across a shadow boundary', async () => {
  const handler = vi.fn();
  let screen = '';
  function Probe() {
    useShortcutHandlers({ acknowledge: handler, 'focus-search': handler, 'open-details': handler });
    screen = useRoute().screen;
    return <><div role="dialog"><span /></div><div role="alertdialog"><span /></div><div aria-modal="true"><span /></div><section /></>;
  }
  const view = await mount(<RuntimeProvider libraryId="ant-design" search="?tick=0" rowFocused={() => true}><Probe /></RuntimeProvider>, true);
  try {
    const host = view.container.querySelector('section')!;
    const dialog = document.createElement('div');
    dialog.setAttribute('aria-modal', 'true');
    const span = document.createElement('span');
    dialog.append(span);
    host.attachShadow({ mode: 'open' }).append(dialog);
    for (const target of [...view.container.querySelectorAll('span'), span]) {
      for (const shortcut of ['/', 'Enter', 'Escape', 'a', '1', '2', '3', '4', '5', '6']) {
        expect((await key(shortcut, target, { composed: true })).defaultPrevented).toBe(false);
        expect(screen).toBe('deck');
      }
    }
    expect(handler).not.toHaveBeenCalled();
  } finally { await view.unmount(); }
});


it('blocks focused Drawer roots and nested shadow dialogs, ignores hidden mounted dialogs, and accepts modalOpen', async () => {
  const acknowledge = vi.fn();
  let modalOpen = false;
  function Probe() { useShortcut('acknowledge', acknowledge); return <div data-drawer><div role="dialog" aria-modal="true" /></div>; }
  const view = await mount(<RuntimeProvider libraryId="ant-design" search="?tick=0" modalOpen={() => modalOpen}><Probe /></RuntimeProvider>);
  try {
    const root = view.container.querySelector('[data-drawer]')!;
    const dialog = root.firstElementChild as HTMLElement;
    expect((await key('a', root)).defaultPrevented).toBe(false);
    for (const hide of [() => { dialog.hidden = true; }, () => { dialog.setAttribute('aria-hidden', 'true'); }, () => { dialog.style.display = 'none'; }, () => { dialog.setAttribute('inert', ''); }]) {
      hide();
      expect((await key('a', root)).defaultPrevented).toBe(true);
      dialog.hidden = false; dialog.removeAttribute('aria-hidden'); dialog.style.display = ''; dialog.removeAttribute('inert');
    }
    dialog.hidden = true;
    modalOpen = true;
    expect((await key('a', document)).defaultPrevented).toBe(false);
    modalOpen = false;
    const native = document.createElement('dialog'); native.setAttribute('open', ''); root.append(native);
    expect((await key('a', native)).defaultPrevented).toBe(false);
    native.removeAttribute('open');
    expect((await key('a', native)).defaultPrevented).toBe(true);
    const host = document.createElement('div'); root.append(host);
    const inner = document.createElement('div'); inner.setAttribute('role', 'dialog'); host.attachShadow({ mode: 'open' }).append(inner);
    const nested = document.createElement('div'); inner.attachShadow({ mode: 'open' }).append(nested);
    expect((await key('a', nested, { composed: true })).defaultPrevented).toBe(false);
    expect(acknowledge).toHaveBeenCalledTimes(5);
    host.hidden = true;
    expect((await key('a', nested, { composed: true })).defaultPrevented).toBe(true);
  } finally { await view.unmount(); }
});

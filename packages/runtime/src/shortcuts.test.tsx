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

it('selects the top registered handler for each action', () => {
  const first = vi.fn(), second = vi.fn();
  expect(topShortcutHandler([{ close: first }, { acknowledge: second }], 'close')).toBe(first);
  expect(topShortcutHandler([{ close: first }, { close: second }], 'close')).toBe(second);
  expect(topShortcutHandler([], 'close')).toBeUndefined();
});

it('handles acknowledge, filters text inputs and native Enter, and owns Screen shortcuts', async () => {
  const acknowledge = vi.fn(), open = vi.fn();
  let screen = '';
  function Probe() {
    useShortcutHandlers({ acknowledge, 'open-details': open });
    screen = useRoute().screen;
    return <><input /><button>Native</button><div role="row" tabIndex={0} /></>;
  }
  const view = await mount(<RuntimeProvider libraryId="ant-design" supportsDensity search="?tick=0"><Probe /></RuntimeProvider>, true);
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

it('lets a drawer take close, preserves its priority on re-render, and falls back on unmount', async () => {
  const first = vi.fn(), updated = vi.fn(), drawer = vi.fn();
  function Screen({ changed }: { changed: boolean }) { useShortcut('close', changed ? updated : first); return null; }
  function Drawer() { useShortcut('close', drawer); return null; }
  const tree = (show: boolean, changed = false) => <RuntimeProvider libraryId="ant-design" supportsDensity search="?tick=0"><Screen changed={changed} />{show && <Drawer />}</RuntimeProvider>;
  const view = await mount(tree(false), true);
  try {
    await key('Escape');
    expect(first).toHaveBeenCalledTimes(1);
    await view.render(tree(true));
    await key('Escape');
    expect(drawer).toHaveBeenCalledTimes(1);
    await view.render(tree(true, true));
    await key('Escape');
    expect(drawer).toHaveBeenCalledTimes(2);
    expect(updated).not.toHaveBeenCalled();
    await view.render(tree(false, true));
    await key('Escape');
    expect(updated).toHaveBeenCalledTimes(1);
    await view.render(<RuntimeProvider libraryId="ant-design" supportsDensity search="?tick=0" />);
    expect((await key('Escape')).defaultPrevented).toBe(false);
  } finally { await view.unmount(); }
});

it('only prevents default when handled and accepts an optional row focus predicate', async () => {
  const close = vi.fn(() => false), open = vi.fn();
  function Probe() { useShortcutHandlers({ close, 'open-details': open }); return <div data-row="yes" />; }
  const view = await mount(<RuntimeProvider libraryId="ant-design" supportsDensity search="?tick=0" rowFocused={event => (event.target as HTMLElement)?.dataset?.row === 'yes'}><Probe /></RuntimeProvider>);
  try {
    expect((await key('Escape')).defaultPrevented).toBe(false);
    expect(close).toHaveBeenCalledTimes(1);
    expect((await key('Enter', view.container.querySelector('div')!)).defaultPrevented).toBe(true);
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    event.preventDefault();
    await act(() => { document.dispatchEvent(event); });
    expect(close).toHaveBeenCalledTimes(1);
  } finally { await view.unmount(); }
});

it('forwards composed paths and modifier state from real keyboard events', async () => {
  const acknowledge = vi.fn();
  function Probe() { useShortcut('acknowledge', acknowledge); return <div />; }
  const view = await mount(<RuntimeProvider libraryId="ant-design" supportsDensity search="?tick=0"><Probe /></RuntimeProvider>);
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

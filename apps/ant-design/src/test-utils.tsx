import { act, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { StorageLike } from '@swatchbook/core';
import { RuntimeProvider, usePlantState, type RuntimeProviderProps } from '@swatchbook/runtime';
import type { PlantState } from '@swatchbook/core';
import { Shell } from './Shell';

export function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}

export async function mount(node: ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(() => root.render(<StrictMode>{node}</StrictMode>));
  return { container, async unmount() { await act(() => root.unmount()); container.remove(); } };
}

type AppProps = Omit<RuntimeProviderProps, 'libraryId' | 'children'>;
let latest: PlantState | undefined;
/** Exposes the Plant State so tests can read the Event Log. */
function Probe() { latest = usePlantState().state; return null; }
export const plantState = (): PlantState => latest!;

export async function mountApp(hash: string, props: AppProps = {}) {
  history.replaceState(null, '', `/${hash}`);
  return mount(
    <RuntimeProvider libraryId="ant-design" search="?tick=0" languages={['en']} storage={memoryStorage()} now={() => 0} {...props}>
      <Shell />
      <Probe />
    </RuntimeProvider>,
  );
}

export const byId = (id: string) => document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`);
export function one(id: string): HTMLElement {
  const found = byId(id);
  if (found.length !== 1) throw new Error(`expected one [data-testid="${id}"], found ${found.length}`);
  return found[0]!;
}
export const click = (element: Element) => act(() => { (element as HTMLElement).click(); });
export async function flush() { await act(async () => { await new Promise(r => setTimeout(r, 0)); }); }

export async function openSelect(id: string) {
  const selector = one(id).querySelector('.ant-select-selector') ?? one(id);
  await act(() => { selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
}
export function options(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')];
}
export async function pickOption(id: string, text: string) {
  await openSelect(id);
  const option = options().find(o => o.textContent?.includes(text));
  if (!option) throw new Error(`no option "${text}"; have ${options().map(o => o.textContent).join(' | ')}`);
  await click(option);
}
/** Clicks the Segmented choice with this visible label. */
export async function choose(id: string, label: string) {
  const item = [...one(id).querySelectorAll<HTMLElement>('.ant-segmented-item')].find(el => el.textContent === label);
  if (!item) throw new Error(`no choice "${label}" in ${id}`);
  await click(item.querySelector('input') ?? item);
}

/** happy-dom has no CSS animations, so finish every running leave motion by hand. */
export async function endMotion() {
  for (let round = 0; round < 3; round++) {
    await act(async () => {
      for (const el of document.querySelectorAll('[class*="-leave-active"]')) {
        el.dispatchEvent(new Event('animationend', { bubbles: true }));
        el.dispatchEvent(new Event('transitionend', { bubbles: true }));
      }
      await new Promise(r => setTimeout(r, 0));
    });
  }
}
/** Dialogs that are open. */
export function openDialogs(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.ant-modal-wrap')].filter(el => el.style.display !== 'none');
}

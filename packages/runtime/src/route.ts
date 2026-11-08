import { SCREENS, type ScreenId } from '@swatchbook/core';
import { useEffect, useSyncExternalStore } from 'react';

export function parseHash(hash: string): ScreenId | null {
  const path = hash.split('?')[0]!.replace(/^#\/?/, '/');
  return SCREENS.find(screen => screen.route === path)?.id ?? null;
}
export const screenHash = (screen: ScreenId): string => `#/${screen}`;

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('hashchange', listener);
  return () => { listeners.delete(listener); window.removeEventListener('hashchange', listener); };
}
function go(screen: ScreenId) {
  location.hash = screenHash(screen);
  // Notify all hook consumers immediately; the browser also reports back/forward navigation.
  for (const listener of listeners) listener();
}
const readHash = () => location.hash;

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, readHash);
  const parsed = parseHash(hash);
  useEffect(() => {
    // Another consumer may have navigated since this render.
    if (parseHash(location.hash) !== null) return;
    history.replaceState(null, '', screenHash('deck'));
    for (const listener of listeners) listener();
  }, [hash, parsed]);
  return { screen: parsed ?? 'deck', go };
}

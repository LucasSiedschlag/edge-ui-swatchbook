import { resolveLocale } from './translate';
import type { Locale } from './types';

export const PREFERENCES_KEY = 'swatchbook.preferences';

export interface Preferences {
  language: Locale;
  theme: 'light' | 'dark';
  density: 'comfortable' | 'compact';
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** The app supplies storage and browser languages; core never accesses the DOM. */
export function loadPreferences(storage: StorageLike | undefined, languages: readonly string[]): Preferences {
  const defaults: Preferences = { language: resolveLocale(languages), theme: 'light', density: 'comfortable' };
  if (!storage) return defaults;
  try {
    const raw = storage.getItem(PREFERENCES_KEY);
    if (raw === null) return defaults;
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return defaults;
    const prefs = value as Record<string, unknown>;
    return {
      language: prefs.language === 'en' || prefs.language === 'pt-BR' ? prefs.language : defaults.language,
      theme: prefs.theme === 'light' || prefs.theme === 'dark' ? prefs.theme : defaults.theme,
      density: prefs.density === 'comfortable' || prefs.density === 'compact' ? prefs.density : defaults.density,
    };
  } catch {
    return defaults;
  }
}

export function savePreferences(storage: StorageLike | undefined, prefs: Preferences): boolean {
  if (!storage) return false;
  try {
    const { language, theme, density } = prefs;
    storage.setItem(PREFERENCES_KEY, JSON.stringify({ language, theme, density }));
    return true;
  } catch {
    return false;
  }
}

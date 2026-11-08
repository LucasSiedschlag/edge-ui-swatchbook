import { loadPreferences, PREFERENCES_KEY, savePreferences, type Preferences, type StorageLike } from '@swatchbook/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export const PRESETS = [
  { id: 'office', theme: 'light', density: 'comfortable' },
  { id: 'control-room', theme: 'dark', density: 'compact' },
  { id: 'night', theme: 'dark', density: 'comfortable' },
] as const;
export type PresetId = typeof PRESETS[number]['id'];
export type PreferenceChange = Partial<Preferences> & { preset?: PresetId };

export function presetFor(prefs: Pick<Preferences, 'theme' | 'density'>): PresetId | null {
  return PRESETS.find(p => p.theme === prefs.theme && p.density === prefs.density)?.id ?? null;
}
export function preferenceChange(current: Preferences, change: PreferenceChange, supportsDensity: boolean): Preferences {
  const preset = PRESETS.find(p => p.id === change.preset);
  return {
    language: change.language ?? current.language,
    theme: preset?.theme ?? change.theme ?? current.theme,
    density: preset?.density ?? (supportsDensity ? change.density ?? current.density : current.density),
  };
}

export interface RuntimePreferences extends Preferences {
  preset: PresetId | null;
  supportsDensity: boolean;
  densityUnavailable: boolean;
  setLanguage(language: Preferences['language']): void;
  setTheme(theme: Preferences['theme']): void;
  setDensity(density: Preferences['density']): void;
  applyPreset(preset: PresetId): void;
}
const PreferencesContext = createContext<RuntimePreferences | null>(null);
function browserStorage(): StorageLike | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

export function PreferencesProvider({ children, supportsDensity, storage, languages }: {
  children: ReactNode; supportsDensity: boolean; storage?: StorageLike; languages?: readonly string[];
}) {
  const initial = useRef<{ storage: StorageLike | undefined; languages: readonly string[]; prefs: Preferences } | null>(null);
  if (!initial.current) {
    const source = storage ?? browserStorage();
    const browserLanguages = languages ?? navigator.languages;
    initial.current = { storage: source, languages: browserLanguages, prefs: loadPreferences(source, browserLanguages) };
  }
  const options = initial.current;
  const [state, setState] = useState({ prefs: options.prefs, local: false });
  useEffect(() => { document.documentElement.lang = state.prefs.language; }, [state.prefs.language]);
  useEffect(() => { if (state.local) savePreferences(options.storage, state.prefs); }, [options, state]);
  useEffect(() => {
    function receive(event: StorageEvent) {
      if (event.key !== PREFERENCES_KEY && event.key !== null) return;
      if (event.storageArea && event.storageArea !== options.storage) return;
      const prefs = loadPreferences({ getItem: () => event.newValue, setItem: () => {} }, options.languages);
      setState({ prefs, local: false });
    }
    window.addEventListener('storage', receive);
    return () => window.removeEventListener('storage', receive);
  }, [options]);
  const change = useCallback((change: PreferenceChange) => {
    setState(previous => {
      const prefs = preferenceChange(previous.prefs, change, supportsDensity);
      if (!change.preset && prefs.language === previous.prefs.language && prefs.theme === previous.prefs.theme && prefs.density === previous.prefs.density) return previous;
      return { prefs, local: true };
    });
  }, [supportsDensity]);
  const value = useMemo<RuntimePreferences>(() => ({
    ...state.prefs, preset: presetFor(state.prefs), supportsDensity, densityUnavailable: !supportsDensity,
    setLanguage: language => change({ language }), setTheme: theme => change({ theme }),
    setDensity: density => change({ density }), applyPreset: preset => change({ preset }),
  }), [state.prefs, supportsDensity, change]);
  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}
export function usePreferences(): RuntimePreferences {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences requires RuntimeProvider');
  return value;
}

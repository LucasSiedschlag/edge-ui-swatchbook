import { describe, expect, it } from 'vitest';
import { PREFERENCES_KEY, loadPreferences, savePreferences, type Preferences, type StorageLike } from './preferences';

function memory(initial?: string): StorageLike & { values: Map<string, string> } {
  const values = new Map<string, string>(initial === undefined ? [] : [[PREFERENCES_KEY, initial]]);
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}
const defaults: Preferences = { language: 'pt-BR', theme: 'light', density: 'comfortable' };

describe('preferences', () => {
  it('uses browser language and field defaults without DOM or storage', () => {
    expect(PREFERENCES_KEY).toBe('swatchbook.preferences');
    expect(loadPreferences(undefined, ['pt-BR'])).toEqual(defaults);
    expect(loadPreferences(memory(), ['pt'])).toEqual(defaults);
    expect(loadPreferences(undefined, ['fr'])).toEqual({ ...defaults, language: 'en' });
    expect(savePreferences(undefined, defaults)).toBe(false);
  });

  it('round trips all preferences under the shared key, replacing only that key', () => {
    const storage = memory();
    storage.values.set('other.app', 'untouched');
    const prefs: Preferences = { language: 'en', theme: 'dark', density: 'compact' };
    expect(savePreferences(storage, prefs)).toBe(true);
    expect(storage.values.get(PREFERENCES_KEY)).toBe(JSON.stringify(prefs));
    expect(storage.values.get('other.app')).toBe('untouched');
    expect(loadPreferences(storage, ['pt'])).toEqual(prefs);
    expect(savePreferences(storage, defaults)).toBe(true);
    expect(loadPreferences(storage, ['en'])).toEqual(defaults);
  });

  it.each(['bad json', '', 'null', '42', 'true', '"text"', '[]', '["en", "dark", "compact"]'])('defaults for malformed or nonobject data %s', (raw) => {
    expect(loadPreferences(memory(raw), ['pt'])).toEqual(defaults);
  });

  it.each([
    [{ language: 'fr', theme: 'dark', density: 'compact' }, { ...defaults, theme: 'dark', density: 'compact' }],
    [{ language: 'en', theme: 'system', density: 'compact' }, { ...defaults, language: 'en', density: 'compact' }],
    [{ language: 'en', theme: 'dark', density: 'dense' }, { ...defaults, language: 'en', theme: 'dark' }],
    [{ language: 1, theme: null, density: false }, defaults],
    [{ theme: 'dark', unknown: 'ignored' }, { ...defaults, theme: 'dark' }],
    [{ language: {}, theme: [], density: {} }, defaults],
  ])('validates fields independently: %j', (stored, expected) => {
    expect(loadPreferences(memory(JSON.stringify(stored)), ['pt'])).toEqual(expected);
  });

  it('catches failures from every storage operation', () => {
    const throwing: StorageLike = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('quota exceeded'); },
    };
    expect(loadPreferences(throwing, ['pt'])).toEqual(defaults);
    expect(savePreferences(throwing, defaults)).toBe(false);
  });

  it('saves exactly the three preference fields without merging extras', () => {
    const storage = memory('{"extra":"old"}');
    const extended = { ...defaults, extra: 'new' };
    expect(savePreferences(storage, extended)).toBe(true);
    expect(storage.values.get(PREFERENCES_KEY)).toBe(JSON.stringify(defaults));
  });
});

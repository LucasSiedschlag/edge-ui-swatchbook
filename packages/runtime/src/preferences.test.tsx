// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { PREFERENCES_KEY, type Preferences } from '@swatchbook/core';
import { RuntimeProvider } from './plant';
import { PRESETS, preferenceChange, presetFor, usePreferences } from './preferences';
import { mount } from './testing';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); history.replaceState(null, '', '/'); });
const initial: Preferences = { language: 'en', theme: 'light', density: 'comfortable' };

it('derives presets and applies both values, preserving unsupported density', () => {
  expect(PRESETS).toEqual([
    { id: 'office', theme: 'light', density: 'comfortable' },
    { id: 'control-room', theme: 'dark', density: 'compact' },
    { id: 'night', theme: 'dark', density: 'comfortable' },
  ]);
  for (const preset of PRESETS) {
    const changed = preferenceChange(initial, { preset: preset.id }, true);
    expect(presetFor(changed)).toBe(preset.id);
  }
  expect(presetFor({ ...initial, density: 'compact' })).toBeNull();
  expect(preferenceChange(initial, { density: 'compact' }, false)).toEqual(initial);
  expect(preferenceChange(initial, { preset: 'control-room' }, false)).toEqual({ ...initial, theme: 'dark' });
});

it('loads once, saves changes in one key, shares hook state and updates document language', async () => {
  const storage = { getItem: vi.fn(() => JSON.stringify({ language: 'pt-BR', theme: 'dark', density: 'compact' })), setItem: vi.fn() };
  let prefs!: ReturnType<typeof usePreferences>, other!: ReturnType<typeof usePreferences>;
  function Probe() { prefs = usePreferences(); return null; }
  function Other() { other = usePreferences(); return null; }
  const view = await mount(<RuntimeProvider libraryId="ant-design" supportsDensity storage={storage} languages={['en']} search="?tick=0"><Probe /><Other /></RuntimeProvider>, true);
  try {
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(prefs).toBe(other);
    expect(prefs).toMatchObject({ language: 'pt-BR', theme: 'dark', density: 'compact', preset: 'control-room', densityUnavailable: false });
    expect(document.documentElement.lang).toBe('pt-BR');
    storage.setItem.mockClear();
    await act(() => { prefs.setLanguage('en'); prefs.setTheme('light'); prefs.setDensity('comfortable'); });
    expect(prefs).toMatchObject(initial);
    expect(document.documentElement.lang).toBe('en');
    expect(storage.setItem).toHaveBeenLastCalledWith(PREFERENCES_KEY, JSON.stringify(initial));
    await act(() => prefs.applyPreset('night'));
    expect(prefs).toMatchObject({ theme: 'dark', density: 'comfortable', preset: 'night' });
    await act(() => prefs.applyPreset('control-room'));
    expect(prefs).toMatchObject({ theme: 'dark', density: 'compact', preset: 'control-room' });
    await act(() => prefs.applyPreset('office'));
    expect(prefs).toMatchObject(initial);
  } finally { await view.unmount(); }
});

it('follows storage events without writing them back, and ignores other keys and storage areas', async () => {
  let prefs!: ReturnType<typeof usePreferences>;
  function Probe() { prefs = usePreferences(); return null; }
  const view = await mount(<RuntimeProvider libraryId="ant-design" supportsDensity languages={['pt-BR']} search="?tick=0"><Probe /></RuntimeProvider>, true);
  try {
    const save = vi.spyOn(Storage.prototype, 'setItem');
    const remote: Preferences = { language: 'en', theme: 'dark', density: 'compact' };
    const event = (key: string | null, newValue: string | null, storageArea: Storage | null = localStorage) => window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea }));
    await act(() => { event('other', JSON.stringify(remote)); event(PREFERENCES_KEY, JSON.stringify(remote), sessionStorage); });
    expect(prefs.language).toBe('pt-BR');
    await act(() => { event(PREFERENCES_KEY, JSON.stringify(remote)); });
    expect(prefs).toMatchObject(remote);
    expect(document.documentElement.lang).toBe('en');
    expect(save).not.toHaveBeenCalled();
    await act(() => { event(PREFERENCES_KEY, null); });
    expect(prefs).toMatchObject({ ...initial, language: 'pt-BR' });
    await act(() => { event(PREFERENCES_KEY, '{broken'); });
    expect(prefs).toMatchObject({ ...initial, language: 'pt-BR' });
    await act(() => { event(PREFERENCES_KEY, JSON.stringify(remote)); event(null, null); });
    expect(prefs).toMatchObject({ ...initial, language: 'pt-BR' });
  } finally { await view.unmount(); }
});

it('keeps density when the Library cannot render it, including preset and external changes', async () => {
  let prefs!: ReturnType<typeof usePreferences>;
  function Probe() { prefs = usePreferences(); return null; }
  const view = await mount(<RuntimeProvider libraryId="ix" supportsDensity={false} languages={['en']} search="?tick=0"><Probe /></RuntimeProvider>);
  try {
    expect(prefs.densityUnavailable).toBe(true);
    expect(prefs.supportsDensity).toBe(false);
    await act(() => prefs.setDensity('compact'));
    expect(prefs.density).toBe('comfortable');
    await act(() => prefs.applyPreset('control-room'));
    expect(prefs).toMatchObject({ theme: 'dark', density: 'comfortable', preset: 'night' });
    await act(() => window.dispatchEvent(new StorageEvent('storage', { key: PREFERENCES_KEY, newValue: JSON.stringify({ language: 'pt-BR', theme: 'light', density: 'compact' }) })));
    // External preferences remain shared even if this Library cannot render their density.
    expect(prefs).toMatchObject({ language: 'pt-BR', theme: 'light', density: 'compact' });
    await act(() => prefs.applyPreset('office'));
    expect(prefs.density).toBe('compact');
  } finally { await view.unmount(); }
});

it('survives unavailable storage and follows browser language defaults', async () => {
  const getter = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
  let prefs!: ReturnType<typeof usePreferences>;
  function Probe() { prefs = usePreferences(); return null; }
  const view = await mount(<RuntimeProvider libraryId="ui5" supportsDensity languages={['fr', 'pt-PT']} search="?tick=0"><Probe /></RuntimeProvider>);
  expect(prefs).toMatchObject({ ...initial, language: 'pt-BR' });
  await act(() => prefs.setLanguage('en'));
  expect(prefs.language).toBe('en');
  await view.unmount();
  getter.mockRestore();
});

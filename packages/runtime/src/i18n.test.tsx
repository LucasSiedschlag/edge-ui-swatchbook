// @vitest-environment happy-dom
import { act } from 'react';
import { expect, it } from 'vitest';
import * as core from '@swatchbook/core';
import { bindI18n, useI18n } from './i18n';
import { RuntimeProvider } from './plant';
import { usePreferences } from './preferences';
import { mount } from './testing';

it.each(core.LOCALES)('binds all translations and formats to %s', locale => {
  const i18n = bindI18n(locale);
  const time = Date.UTC(2026, 0, 12, 14, 15, 16);
  expect(i18n.t('tour.progress', { current: 2, total: 6 })).toBe(core.t(locale, 'tour.progress', { current: 2, total: 6 }));
  expect(i18n.tr({ key: 'screen.deck' })).toBe(core.tr(locale, { key: 'screen.deck' }));
  expect(i18n.formatNumber(1234.5, { decimals: 1 })).toBe(core.formatNumber(locale, 1234.5, { decimals: 1 }));
  expect(i18n.formatPercent(0.25, 2)).toBe(core.formatPercent(locale, 0.25, 2));
  expect(i18n.formatPercentValue(25, 0)).toBe(core.formatPercentValue(locale, 25, 0));
  expect(i18n.formatTime(time, { seconds: true })).toBe(core.formatTime(locale, time, { seconds: true }));
  expect(i18n.formatDate(time)).toBe(core.formatDate(locale, time));
  expect(i18n.formatDateTime(time)).toBe(core.formatDateTime(locale, time));
  expect(i18n.formatDuration(3660)).toBe(core.formatDuration(3660));
});

it('switches dictionary, numbers and dates together with preferences', async () => {
  let i18n!: ReturnType<typeof useI18n>, prefs!: ReturnType<typeof usePreferences>;
  function Probe() { i18n = useI18n(); prefs = usePreferences(); return <span>{i18n.t('screen.deck')} {i18n.formatNumber(1234.5, { decimals: 1 })}</span>; }
  const storage = { getItem: () => null, setItem: () => {} };
  const view = await mount(<RuntimeProvider libraryId="ant-design" languages={['en']} storage={storage} search="?tick=0"><Probe /></RuntimeProvider>, true);
  try {
    const time = Date.UTC(2026, 0, 12);
    expect(i18n.locale).toBe('en');
    expect(i18n.formatDate(time)).toBe('01/11/2026');
    expect(view.container.textContent).toContain('1,234.5');
    await act(() => prefs.setLanguage('pt-BR'));
    expect(i18n.locale).toBe('pt-BR');
    expect(i18n.formatDate(time)).toBe('11/01/2026');
    expect(view.container.textContent).toContain('1.234,5');
    expect(view.container.textContent).toContain(core.t('pt-BR', 'screen.deck'));
  } finally { await view.unmount(); }
});

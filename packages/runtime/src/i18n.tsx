import {
  t, tr, tCount, formatPercentagePoints, formatNumber, formatPercent, formatPercentValue, formatTime, formatDate, formatDateTime, formatDuration, type Locale,
} from '@swatchbook/core';
import { useMemo } from 'react';
import { usePreferences } from './preferences';

export function bindI18n(locale: Locale) {
  return {
    locale, formatPercentagePoints: formatPercentagePoints.bind(null, locale), t: t.bind(null, locale), tr: tr.bind(null, locale), tCount: tCount.bind(null, locale),
    formatNumber: formatNumber.bind(null, locale), formatPercent: formatPercent.bind(null, locale),
    formatPercentValue: formatPercentValue.bind(null, locale), formatTime: formatTime.bind(null, locale),
    formatDate: formatDate.bind(null, locale), formatDateTime: formatDateTime.bind(null, locale), formatDuration,
  };
}
export type I18n = ReturnType<typeof bindI18n>;
export function useI18n(): I18n {
  const { language } = usePreferences();
  return useMemo(() => bindI18n(language), [language]);
}

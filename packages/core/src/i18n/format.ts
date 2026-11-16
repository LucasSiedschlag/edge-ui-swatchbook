import { DECIMALS_BY_UNIT } from './precision';
import type { Timestamp } from '../mock/types';
import type { Locale } from './types';

const INTL_LOCALES: Record<Locale, string> = { en: 'en-US', 'pt-BR': 'pt-BR' };
export const DATE_PATTERNS: Readonly<Record<Locale, string>> = Object.freeze({ en: 'MM/DD/YYYY', 'pt-BR': 'DD/MM/YYYY' });
const TIME_ZONE = 'America/Sao_Paulo';
const normalize = (text: string): string => text
  .replace(/[\u202f\u00a0\u2009]/g, ' ')
  .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');

export interface NumberOptions { decimals?: number }
export interface TimeOptions { seconds?: boolean }

// Formatter construction is expensive. The finite combinations used by the UI share instances.
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();
function optionsKey(locale: string, options: object): string {
  return JSON.stringify([locale, Object.entries(options).sort(([a], [b]) => a.localeCompare(b))]);
}
function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = optionsKey(locale, options);
  let format = numberFormats.get(key);
  if (!format) { format = new Intl.NumberFormat(locale, options); numberFormats.set(key, format); }
  return format;
}
function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = optionsKey(locale, options);
  let format = dateFormats.get(key);
  if (!format) { format = new Intl.DateTimeFormat(locale, options); dateFormats.set(key, format); }
  return format;
}

function numeric(locale: Locale, value: number, decimals: number, style: 'decimal' | 'percent'): string {
  if (!Number.isFinite(value)) return '-';
  // Restrict precision to the range supported consistently by browser and Node Intl implementations.
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 20) throw new RangeError('decimals must be an integer from 0 to 20');
  const parts = numberFormat(INTL_LOCALES[locale], {
    style, numberingSystem: 'latn', useGrouping: true,
    minimumIntegerDigits: 1, minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    notation: 'standard', signDisplay: 'auto',
  }).formatToParts(value);
  const zero = parts.filter((p) => p.type === 'integer' || p.type === 'fraction').every((p) => /^0+$/.test(p.value));
  return normalize(parts.filter((p) => !zero || p.type !== 'minusSign').map((p) => p.value).join(''));
}

/** Decimal mark for locale-aware numeric inputs, without grouping separators. */
export function decimalSeparator(locale: Locale): string {
  return numberFormat(INTL_LOCALES[locale], { useGrouping: false }).formatToParts(1.1)
    .find(part => part.type === 'decimal')!.value;
}

/** Numbers default to whole units; explicit decimals keep trailing zeroes. */
export function formatNumber(locale: Locale, n: number, { decimals = 0 }: NumberOptions = {}): string {
  return numeric(locale, n, decimals, 'decimal');
}

/** Input is a fraction. The default is one decimal place. */
export function formatPercent(locale: Locale, fraction: number, decimals = 1): string {
  return numeric(locale, fraction, decimals, 'percent');
}

/** Input is a percentage from 0 to 100. */
export function formatPercentValue(locale: Locale, percent: number, decimals = 1): string {
  return formatPercent(locale, percent / 100, decimals);
}

function dateTime(locale: Locale, ts: Timestamp, options: Intl.DateTimeFormatOptions): string {
  if (!Number.isFinite(ts) || !Number.isFinite(new Date(ts).getTime())) return '-';
  return normalize(dateFormat(INTL_LOCALES[locale], {
    timeZone: TIME_ZONE, calendar: 'gregory', numberingSystem: 'latn', ...options,
  }).formatToParts(ts).map((p) => p.value).join(''));
}

export function formatDate(locale: Locale, ts: Timestamp): string {
  return dateTime(locale, ts, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function formatTime(locale: Locale, ts: Timestamp, { seconds = false }: TimeOptions = {}): string {
  return dateTime(locale, ts, { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hourCycle: 'h23' });
}

/** A fixed single space separates the native numeric date from 24 hour time. */
export function formatDateTime(locale: Locale, ts: Timestamp): string {
  const date = formatDate(locale, ts);
  return date === '-' ? '-' : `${date} ${formatTime(locale, ts)}`;
}

/**
 * Nonnegative elapsed seconds, truncated to two adjacent units at most.
 * Below a minute, show seconds only. Units are literal and never translated.
 */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '-';
  const seconds = Math.floor(totalSeconds);
  const integer = (n: number) => numberFormat('en-US', {
    numberingSystem: 'latn', useGrouping: false, maximumFractionDigits: 0,
  }).format(n);
  const pair = (n: number) => integer(n).padStart(2, '0');
  if (seconds >= 86400) return `${integer(Math.floor(seconds / 86400))} d ${pair(Math.floor(seconds / 3600) % 24)} h`;
  if (seconds >= 3600) return `${integer(Math.floor(seconds / 3600))} h ${pair(Math.floor(seconds / 60) % 60)} min`;
  if (seconds >= 60) return `${integer(Math.floor(seconds / 60))} min ${pair(seconds % 60)} s`;
  return `${integer(seconds)} s`;
}


/** Formats the numeric part only. The caller renders the unchanged unit alongside it. */
export function formatTagValue(locale: Locale, value: number | null, unit: string): string {
  return value === null ? '-' : formatNumber(locale, value, { decimals: DECIMALS_BY_UNIT[unit as keyof typeof DECIMALS_BY_UNIT] ?? 1 });
}

/**
 * Signed changes, one decimal. OEE changes are percentage POINTS on the 0 to 100 scale:
 * convert a fraction difference such as 0.012 to 1.2 before passing kind 'points'.
 * 'percent' receives relative percent on the 0 to 100 scale and appends the percent sign.
 */
export function formatChange(locale: Locale, delta: number, kind: 'points' | 'percent'): string {
  const number = formatNumber(locale, delta, { decimals: 1 });
  if (number === '-') return number;
  return `${number.startsWith('-') ? '' : '+'}${number}${kind === 'percent' ? '%' : ''}`;
}

/** Fraction differences shown as signed percentage points on the 0 to 100 scale. */
export function formatPercentagePoints(locale: Locale, fraction: number): string {
  const value = formatChange(locale, fraction * 100, 'points');
  return value === '-' ? value : `${value} pp`;
}

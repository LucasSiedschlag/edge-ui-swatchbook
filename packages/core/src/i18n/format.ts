import type { Timestamp } from '../mock/types';
import type { Locale } from './types';

const INTL_LOCALES: Record<Locale, string> = { en: 'en-US', 'pt-BR': 'pt-BR' };
const TIME_ZONE = 'America/Sao_Paulo';
const normalize = (text: string): string => text
  .replace(/[\u202f\u00a0\u2009]/g, ' ')
  .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');

export interface NumberOptions { decimals?: number }
export interface TimeOptions { seconds?: boolean }

function numeric(locale: Locale, value: number, decimals: number, style: 'decimal' | 'percent'): string {
  if (!Number.isFinite(value)) return '-';
  // Restrict precision to the range supported consistently by browser and Node Intl implementations.
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 20) throw new RangeError('decimals must be an integer from 0 to 20');
  const parts = new Intl.NumberFormat(INTL_LOCALES[locale], {
    style, numberingSystem: 'latn', useGrouping: true,
    minimumIntegerDigits: 1, minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    notation: 'standard', signDisplay: 'auto',
  }).formatToParts(value);
  const zero = parts.filter((p) => p.type === 'integer' || p.type === 'fraction').every((p) => /^0+$/.test(p.value));
  return normalize(parts.filter((p) => !zero || p.type !== 'minusSign').map((p) => p.value).join(''));
}

/** Numbers default to whole units; explicit decimals keep trailing zeroes. */
export function formatNumber(locale: Locale, n: number, { decimals = 0 }: NumberOptions = {}): string {
  return numeric(locale, n, decimals, 'decimal');
}

/** Input is a fraction. The default is one decimal place. */
export function formatPercent(locale: Locale, fraction: number, decimals = 1): string {
  return numeric(locale, fraction, decimals, 'percent');
}

function dateTime(locale: Locale, ts: Timestamp, options: Intl.DateTimeFormatOptions): string {
  if (!Number.isFinite(ts) || !Number.isFinite(new Date(ts).getTime())) return '-';
  return normalize(new Intl.DateTimeFormat(INTL_LOCALES[locale], {
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
  const integer = (n: number) => new Intl.NumberFormat('en-US', {
    numberingSystem: 'latn', useGrouping: false, maximumFractionDigits: 0,
  }).format(n);
  const pair = (n: number) => integer(n).padStart(2, '0');
  if (seconds >= 86400) return `${integer(Math.floor(seconds / 86400))} d ${pair(Math.floor(seconds / 3600) % 24)} h`;
  if (seconds >= 3600) return `${integer(Math.floor(seconds / 3600))} h ${pair(Math.floor(seconds / 60) % 60)} min`;
  if (seconds >= 60) return `${integer(Math.floor(seconds / 60))} min ${pair(seconds % 60)} s`;
  return `${integer(seconds)} s`;
}

import type { TextRef } from '../mock/types';
import { en, ptBR, type MessageKey } from './messages';
import type { Locale, MessageParams } from './types';

/** Every English variant uses en-US dates (MM/DD/YYYY) and a 24 hour clock. */
export function resolveLocale(languages: readonly unknown[]): Locale {
  for (const language of languages) {
    if (typeof language !== 'string') continue;
    const lower = language.toLowerCase();
    if (/^pt(?:-|$)/.test(lower)) return 'pt-BR';
    if (/^en(?:-|$)/.test(lower)) return 'en';
  }
  return 'en';
}

export function t(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const message = (locale === 'pt-BR' ? ptBR : en)[key];
  return message.replace(/\{([a-z]+)\}/g, (placeholder: string, name: string) =>
    params && Object.hasOwn(params, name) ? String(params[name]) : placeholder);
}

/** Data may come from a newer dictionary. Keep unsupported keys visible. */
export function tr(locale: Locale, ref: TextRef): string {
  return Object.hasOwn(en, ref.key) ? t(locale, ref.key as MessageKey, ref.params) : `[[${ref.key}]]`;
}

/** Keys that exist in a singular and a plural form: `<base>.one` and `<base>.other`. */
export type CountKey = { [K in MessageKey]: K extends `${infer B}.one` ? (`${B}.other` extends MessageKey ? B : never) : never }[MessageKey];

/**
 * A counted text. Exactly one uses `<base>.one`, everything else (including zero) uses `<base>.other`, in both languages, so
 * every Library picks the same form. The count is passed to the text as `{count}`.
 */
export function tCount(locale: Locale, base: CountKey, count: number, params?: MessageParams): string {
  const form = count === 1 ? 'one' : 'other';
  return t(locale, `${base}.${form}` as MessageKey, { ...params, count });
}

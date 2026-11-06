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

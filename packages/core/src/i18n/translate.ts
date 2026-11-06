import type { TextRef } from '../mock/types';
import { en, ptBR, type MessageKey } from './messages';
import type { Locale, MessageParams } from './types';

export function resolveLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const lower = language.toLowerCase();
    if (lower.startsWith('pt')) return 'pt-BR';
    if (lower.startsWith('en')) return 'en';
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

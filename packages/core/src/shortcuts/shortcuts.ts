import type { ScreenId } from '../screens';

export type ShortcutAction =
  | { type: 'focus-search' }
  | { type: 'open-details' }
  | { type: 'close' }
  | { type: 'acknowledge' }
  | { type: 'go-screen'; screen: ScreenId };

export type ShortcutBinding = { key: string; action: ShortcutAction };

const SCREEN_ORDER: readonly ScreenId[] = ['deck', 'recipes', 'ledger', 'performance', 'parameters', 'control'];

/** Shared bindings, defined once. Emergency stop has no shortcut. */
export const SHORTCUTS: readonly ShortcutBinding[] = [
  { key: '/', action: { type: 'focus-search' } },
  { key: 'Enter', action: { type: 'open-details' } },
  { key: 'Escape', action: { type: 'close' } },
  { key: 'a', action: { type: 'acknowledge' } },
  ...SCREEN_ORDER.map((screen, i): ShortcutBinding => ({ key: String(i + 1), action: { type: 'go-screen', screen } })),
];

export type KeyTargetLike = { tagName?: string; isContentEditable?: boolean; type?: string };

export type KeyEventLike = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  target?: KeyTargetLike | null;
};

const NON_TEXT_INPUT_TYPES = ['checkbox', 'radio', 'button', 'submit', 'reset'];

export function isTextEntryTarget(target: KeyTargetLike | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !NON_TEXT_INPUT_TYPES.includes((target.type ?? '').toLowerCase());
  return false;
}

export function resolveShortcut(event: KeyEventLike, context?: { textFieldFocused?: boolean }): ShortcutAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const key = event.key === 'A' ? 'a' : event.key;
  const binding = SHORTCUTS.find((s) => s.key === key);
  if (!binding) return null;
  if (binding.action.type !== 'close' && (context?.textFieldFocused || isTextEntryTarget(event.target))) return null;
  if (binding.action.type === 'acknowledge' && event.repeat) return null;
  return binding.action;
}

export type ShortcutMessageKey =
  | 'shortcut.focus-search'
  | 'shortcut.open-details'
  | 'shortcut.close'
  | 'shortcut.acknowledge'
  | 'shortcut.go-screen';

export const SHORTCUT_HELP: readonly { keys: string; action: ShortcutMessageKey }[] = [
  { keys: '/', action: 'shortcut.focus-search' },
  { keys: 'Enter', action: 'shortcut.open-details' },
  { keys: 'Esc', action: 'shortcut.close' },
  { keys: 'a', action: 'shortcut.acknowledge' },
  { keys: '1-6', action: 'shortcut.go-screen' },
];

export const SHORTCUT_MESSAGES: Record<'en' | 'pt-BR', Record<ShortcutMessageKey, string>> = {
  en: {
    'shortcut.focus-search': 'Focus the search field',
    'shortcut.open-details': 'Open details of the focused row',
    'shortcut.close': 'Close the open drawer or dialog',
    'shortcut.acknowledge': 'Acknowledge the selected Alarms',
    'shortcut.go-screen': 'Go to screen {number}',
  },
  'pt-BR': {
    'shortcut.focus-search': 'Focar o campo de busca',
    'shortcut.open-details': 'Abrir os detalhes da linha em foco',
    'shortcut.close': 'Fechar a gaveta ou o diálogo aberto',
    'shortcut.acknowledge': 'Reconhecer os Alarmes selecionados',
    'shortcut.go-screen': 'Ir para a tela {number}',
  },
};

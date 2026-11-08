import { SCREENS, type ScreenId } from '../screens';

export type ShortcutAction =
  | { type: 'focus-search' }
  | { type: 'open-details' }
  | { type: 'close' }
  | { type: 'acknowledge' }
  | { type: 'go-screen'; screen: ScreenId };

export type ShortcutBinding = { key: string; action: ShortcutAction };

/** Shared bindings, defined once. Emergency stop has no shortcut. */
export const SHORTCUTS: readonly ShortcutBinding[] = [
  { key: '/', action: { type: 'focus-search' } },
  { key: 'Enter', action: { type: 'open-details' } },
  { key: 'Escape', action: { type: 'close' } },
  { key: 'a', action: { type: 'acknowledge' } },
  ...SCREENS.map(({ id: screen }, i): ShortcutBinding => ({ key: String(i + 1), action: { type: 'go-screen', screen } })),
];

export type KeyTargetLike = { tagName?: string; isContentEditable?: boolean; type?: string; role?: string; contentEditable?: string };

export type KeyEventLike = {
  key: string;
  isComposing?: boolean;
  keyCode?: number;
  defaultPrevented?: boolean;
  composedPath?: () => ReadonlyArray<KeyTargetLike>;
  getModifierState?: (key: string) => boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  target?: KeyTargetLike | null;
};

const NON_TEXT_INPUT_TYPES = ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'];

export function isTextEntryTarget(target: KeyTargetLike | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable || ['', 'true', 'plaintext-only'].includes(target.contentEditable ?? 'false')) return true;
  if (['textbox', 'combobox', 'searchbox', 'spinbutton'].includes((target.role ?? '').toLowerCase())) return true;
  const tag = (target.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT' || tag.endsWith('-INPUT')) return !NON_TEXT_INPUT_TYPES.includes((target.type ?? '').toLowerCase());
  return false;
}

export function resolveShortcut(event: KeyEventLike, context?: { textFieldFocused?: boolean; rowFocused?: boolean }): ShortcutAction | null {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || ['Process', 'Dead', 'Unidentified'].includes(event.key)) return null;
  const altGraph = event.ctrlKey && event.altKey && event.getModifierState?.('AltGraph') === true;
  if (event.metaKey || ((event.ctrlKey || event.altKey) && !altGraph)) return null;
  const path = [event.target, ...(event.composedPath?.() ?? [])];
  if (context?.textFieldFocused || path.some(isTextEntryTarget)) return null;
  const key = event.key === 'A' ? 'a' : event.key;
  const binding = SHORTCUTS.find((s) => s.key === key);
  if (!binding) return null;
  if (binding.action.type === 'open-details') {
    // Native activation wins even when the control is inside a focused row.
    if (path.some((target) => target && (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes((target.tagName ?? '').toUpperCase()) || ['button', 'link'].includes(target.role ?? '')))) return null;
    if (!context?.rowFocused && !path.some((target) => target?.role === 'row' || target?.tagName?.toUpperCase() === 'TR')) return null;
  }
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
    'shortcut.focus-search': 'Focus the filter or search field',
    'shortcut.open-details': 'Open details of the focused row',
    'shortcut.close': 'Close the open drawer or dialog',
    'shortcut.acknowledge': 'Acknowledge the selected Alarms',
    'shortcut.go-screen': 'Go to screen {number}',
  },
  'pt-BR': {
    'shortcut.focus-search': 'Focar o campo de filtro ou busca',
    'shortcut.open-details': 'Abrir os detalhes do item em foco',
    'shortcut.close': 'Fechar a gaveta ou o diálogo aberto',
    'shortcut.acknowledge': 'Reconhecer os Alarmes selecionados',
    'shortcut.go-screen': 'Ir para a tela {number}',
  },
};

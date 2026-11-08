import { resolveShortcut, type KeyEventLike, type KeyTargetLike, type ShortcutAction } from '@swatchbook/core';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useRoute } from './route';

export type HandledShortcut = Exclude<ShortcutAction, { type: 'go-screen' }>;
export type ShortcutType = HandledShortcut['type'];
/** Returning false declines the action. A void return means it was handled. */
export type ShortcutHandler = (action: HandledShortcut) => boolean | void;
export type ShortcutHandlers = Partial<Record<ShortcutType, ShortcutHandler>>;
export type RowFocusPredicate = (event: KeyboardEvent) => boolean;

export function topShortcutHandler(stack: readonly ShortcutHandlers[], action: ShortcutType): ShortcutHandler | undefined {
  for (let i = stack.length - 1; i >= 0; i--) {
    const handler = stack[i]?.[action];
    if (handler) return handler;
  }
  return undefined;
}
function targetLike(target: EventTarget | null): KeyTargetLike | null {
  if (!(target instanceof Element)) return null;
  const element = target as HTMLElement & { type?: string };
  return {
    tagName: element.tagName, type: element.type, role: element.getAttribute('role') ?? undefined,
    isContentEditable: element.isContentEditable, contentEditable: element.getAttribute('contenteditable') ?? undefined,
  };
}
/** Adapt native methods explicitly so their receiver remains the KeyboardEvent. */
export function keyboardEventLike(event: KeyboardEvent): KeyEventLike {
  return {
    key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey,
    repeat: event.repeat, isComposing: event.isComposing, keyCode: event.keyCode, defaultPrevented: event.defaultPrevented,
    target: targetLike(event.target), composedPath: () => event.composedPath().map(targetLike).filter(target => target !== null),
    getModifierState: key => event.getModifierState(key),
  };
}

type Registration = { current: ShortcutHandlers };
const ShortcutContext = createContext<Registration[] | null>(null);
export function ShortcutsProvider({ children, rowFocused }: { children: ReactNode; rowFocused?: RowFocusPredicate }) {
  const stack = useRef<Registration[]>([]).current;
  const { go } = useRoute();
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const action = resolveShortcut(keyboardEventLike(event), { rowFocused: rowFocused?.(event) });
      if (!action) return;
      if (action.type === 'go-screen') { go(action.screen); event.preventDefault(); return; }
      const handler = topShortcutHandler(stack.map(entry => entry.current), action.type);
      if (handler && handler(action) !== false) event.preventDefault();
    }
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [go, rowFocused, stack]);
  return <ShortcutContext value={stack}>{children}</ShortcutContext>;
}

export function useShortcutHandlers(handlers: ShortcutHandlers): void {
  const stack = useContext(ShortcutContext);
  if (!stack) throw new Error('useShortcutHandlers requires RuntimeProvider');
  const registration = useRef<Registration>({ current: handlers });
  useLayoutEffect(() => { registration.current.current = handlers; });
  useEffect(() => {
    const entry = registration.current;
    stack.push(entry);
    return () => { const index = stack.indexOf(entry); if (index !== -1) stack.splice(index, 1); };
  }, [stack]);
}
export function useShortcut(action: ShortcutType, handler: ShortcutHandler): void {
  useShortcutHandlers({ [action]: handler });
}
